package service

import (
	"context"
	"encoding/json"
	"log/slog"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/internal/util"
)

// ChannelMessageTarget represents one resolved target on a channel message.
// Returned in the send response so the user immediately sees who their
// message went to, and persisted on the channel_message row so refresh
// shows the same status.
type ChannelMessageTarget struct {
	Kind   string `json:"kind"` // "agent" — squads come later
	ID     string `json:"id"`
	Name   string `json:"name"`
	TaskID string `json:"task_id,omitempty"`
	Status string `json:"status"` // "queued" | "running" | "completed" | "failed" | "cancelled"
}

// ChannelTargetSpec is what clients send when trigger_mode="manual".
type ChannelTargetSpec struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

// channelTargetQueries is the narrow Queries surface used by ResolveChannelTargets.
// Defined as an interface so unit tests can inject an in-memory fake.
type channelTargetQueries interface {
	GetChannel(ctx context.Context, id pgtype.UUID) (db.Channel, error)
	CountAgentTurnsInThread(ctx context.Context, id pgtype.UUID) (int32, error)
	ListChannelAgentMembers(ctx context.Context, channelID pgtype.UUID) ([]pgtype.UUID, error)
	GetAgent(ctx context.Context, id pgtype.UUID) (db.Agent, error)
}

// ResolveChannelTargetsInput captures everything ResolveChannelTargets needs
// from the HTTP request and message row. Keeps the function signature flat.
type ResolveChannelTargetsInput struct {
	ChannelID pgtype.UUID
	// Message is the just-inserted channel_message row (used for thread-root
	// loop detection and content fallback parsing).
	Message db.ChannelMessage
	// TriggerMode is the client's explicit choice. nil = legacy fallback.
	TriggerMode *string
	// Targets is what the client requested when TriggerMode == "manual".
	Targets []ChannelTargetSpec
}

// ResolveChannelTargets is the single source of truth for "which agents
// should respond to this message". B2 priority order:
//
//  1. Loop guard: if the thread has already burned through max_agent_turns,
//     no one responds (returns nil regardless of mode).
//  2. Structured request: if TriggerMode is set, use it.
//     - "none"    → []
//     - "manual"  → only the Targets that are current channel agent members
//     - "auto"    → channel.auto_reply_strategy:
//        • "all_agents"    → every agent member
//        • "default_agent" → only channel.default_target_id (if it's still a member)
//  3. Legacy fallback (TriggerMode == nil): @mention parse first, then
//     channel.auto_reply with the same strategy as path 2.
//
// Returns an empty slice when no one should respond (not an error). Callers
// should check len() before broadcasting / enqueueing.
func ResolveChannelTargets(ctx context.Context, q channelTargetQueries, in ResolveChannelTargetsInput) []ChannelMessageTarget {
	ch, err := q.GetChannel(ctx, in.ChannelID)
	if err != nil {
		return nil
	}

	// Loop prevention: cap agent turns per thread.
	threadRoot := in.Message.ID
	if in.Message.ThreadParentID.Valid {
		threadRoot = in.Message.ThreadParentID
	}
	if turns, _ := q.CountAgentTurnsInThread(ctx, threadRoot); turns >= maxAgentTurnsForChannel(ch) {
		slog.Info("channel target resolve: max agent turns reached",
			"channel_id", util.UUIDToString(in.ChannelID),
			"turns", turns,
			"max", maxAgentTurnsForChannel(ch),
		)
		return nil
	}

	// Load channel agent members + agent rows. Both paths need this set.
	memberAgents := loadChannelAgentRoster(ctx, q, in.ChannelID)
	if len(memberAgents.ordered) == 0 {
		return nil
	}

	// Structured path.
	if in.TriggerMode != nil {
		mode := strings.ToLower(strings.TrimSpace(*in.TriggerMode))
		switch mode {
		case "none":
			return nil
		case "manual":
			return resolveManualTargets(in.Targets, memberAgents)
		case "auto":
			return resolveAutoTargetsWithStrategy(ch, memberAgents)
		default:
			slog.Warn("unknown channel trigger_mode, falling back to legacy resolution",
				"channel_id", util.UUIDToString(in.ChannelID),
				"trigger_mode", mode,
			)
			// fall through
		}
	}

	// Legacy fallback: @mention first, then channel auto_reply.
	if mentioned := parseMentionsFromContent(in.Message.Content, memberAgents); len(mentioned) > 0 {
		return mentioned
	}
	if in.Message.SenderType == "human" && ch.AutoReply {
		return resolveAutoTargetsWithStrategy(ch, memberAgents)
	}
	return nil
}

// maxAgentTurnsForChannel returns the cap, falling back to a sane default
// when channel.MaxAgentTurns is zero (legacy rows that pre-date the column).
func maxAgentTurnsForChannel(ch db.Channel) int32 {
	if ch.MaxAgentTurns > 0 {
		return ch.MaxAgentTurns
	}
	return 20
}

// channelAgentRow is the resolved agent metadata kept in the membership map.
type channelAgentRow struct {
	id   pgtype.UUID
	name string
}

// channelAgentRoster maps both id (uuid string) and lowercase name to the
// same channelAgentRow, for the two lookup styles used during resolution.
type channelAgentRoster struct {
	byID    map[string]channelAgentRow
	byName  map[string]channelAgentRow
	ordered []channelAgentRow
}

func loadChannelAgentRoster(ctx context.Context, q channelTargetQueries, channelID pgtype.UUID) channelAgentRoster {
	memberIDs, err := q.ListChannelAgentMembers(ctx, channelID)
	if err != nil || len(memberIDs) == 0 {
		return channelAgentRoster{}
	}
	roster := channelAgentRoster{
		byID:    make(map[string]channelAgentRow, len(memberIDs)),
		byName:  make(map[string]channelAgentRow, len(memberIDs)),
		ordered: make([]channelAgentRow, 0, len(memberIDs)),
	}
	for _, memberID := range memberIDs {
		agent, err := q.GetAgent(ctx, memberID)
		if err != nil || agent.ArchivedAt.Valid || !agent.RuntimeID.Valid {
			continue
		}
		row := channelAgentRow{id: agent.ID, name: agent.Name}
		idStr := util.UUIDToString(agent.ID)
		roster.byID[idStr] = row
		roster.byName[strings.ToLower(agent.Name)] = row
		roster.ordered = append(roster.ordered, row)
	}
	return roster
}

// resolveManualTargets validates each spec is a current agent member.
// Specs that aren't members or aren't agents are silently dropped — partial
// resolution is more useful than a hard fail.
func resolveManualTargets(requested []ChannelTargetSpec, roster channelAgentRoster) []ChannelMessageTarget {
	out := make([]ChannelMessageTarget, 0, len(requested))
	seen := make(map[string]bool, len(requested))
	for _, t := range requested {
		if t.Kind != "agent" {
			continue // squads/other kinds not supported yet
		}
		row, ok := roster.byID[t.ID]
		if !ok {
			continue
		}
		if seen[t.ID] {
			continue
		}
		seen[t.ID] = true
		out = append(out, ChannelMessageTarget{
			Kind: "agent", ID: t.ID, Name: row.name, Status: "queued",
		})
	}
	return out
}

// resolveAutoTargetsWithStrategy implements the auto_reply branch.
// auto_reply_strategy decides how many agents fire when no explicit target
// is provided:
//   - "all_agents"    (default): every agent member of the channel
//   - "default_agent": only the agent named by channel.default_target_id,
//     if it's still a current channel member; otherwise no targets.
func resolveAutoTargetsWithStrategy(ch db.Channel, roster channelAgentRoster) []ChannelMessageTarget {
	strategy := strings.TrimSpace(ch.AutoReplyStrategy)
	if strategy == "" {
		strategy = "all_agents"
	}
	switch strategy {
	case "default_agent":
		if !ch.DefaultTargetID.Valid {
			return nil
		}
		row, ok := roster.byID[util.UUIDToString(ch.DefaultTargetID)]
		if !ok {
			return nil // default agent left the channel or is archived
		}
		return []ChannelMessageTarget{{
			Kind: "agent", ID: util.UUIDToString(row.id), Name: row.name, Status: "queued",
		}}
	default: // "all_agents" and any unknown future value falls through to the safe behaviour
		return rosterToTargets(roster)
	}
}

func rosterToTargets(roster channelAgentRoster) []ChannelMessageTarget {
	out := make([]ChannelMessageTarget, 0, len(roster.ordered))
	for _, row := range roster.ordered {
		out = append(out, ChannelMessageTarget{
			Kind: "agent", ID: util.UUIDToString(row.id), Name: row.name, Status: "queued",
		})
	}
	return out
}

// parseMentionsFromContent reads @name tokens out of message body and
// returns the matching agent rows. Pure tie-breaking: longer names win
// when prefixes overlap (e.g. "千问" vs "千问-pro").
func parseMentionsFromContent(content string, roster channelAgentRoster) []ChannelMessageTarget {
	if content == "" || len(roster.ordered) == 0 {
		return nil
	}
	candidates := make([]string, 0, len(roster.ordered))
	for _, row := range roster.ordered {
		candidates = append(candidates, row.name)
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		return utf8.RuneCountInString(candidates[i]) > utf8.RuneCountInString(candidates[j])
	})
	lower := strings.ToLower(content)
	seen := make(map[string]bool)
	out := make([]ChannelMessageTarget, 0)
	for i := 0; i < len(lower); {
		r, size := utf8.DecodeRuneInString(lower[i:])
		if r != '@' {
			i += size
			continue
		}
		rest := lower[i+size:]
		matched := ""
		for _, candidate := range candidates {
			lc := strings.ToLower(candidate)
			if !strings.HasPrefix(rest, lc) {
				continue
			}
			if !isMentionBoundary(rest[len(lc):]) {
				continue
			}
			matched = candidate
			break
		}
		if matched == "" {
			i += size
			continue
		}
		key := strings.ToLower(matched)
		if !seen[key] {
			seen[key] = true
			if row, ok := roster.byName[key]; ok {
				out = append(out, ChannelMessageTarget{
					Kind: "agent", ID: util.UUIDToString(row.id), Name: row.name, Status: "queued",
				})
			}
		}
		i += size + len(strings.ToLower(matched))
	}
	return out
}

func isMentionBoundary(rest string) bool {
	if rest == "" {
		return true
	}
	r, _ := utf8.DecodeRuneInString(rest)
	if r == utf8.RuneError {
		return false
	}
	switch r {
	case ' ', '\t', '\n', '\r', ',', '.', ':', '!', '?', ';', '。', '，', '、', '；', '！', '？', '：':
		return true
	}
	return false
}

// EnqueueChannelTargets actually creates agent_task_queue rows for the
// resolved targets. Runs in a goroutine off the request path so the HTTP
// handler can return immediately.
//
// Targets whose agent has gone archived/runtime-less between resolve and
// enqueue are skipped with a warning; the caller will broadcast a "failed"
// status update for them via the queries → broadcastChannelTargetStatus
// path so the UI doesn't show "排队中" forever.
func (s *TaskService) EnqueueChannelTargets(
	ctx context.Context,
	channelID pgtype.UUID,
	msg db.ChannelMessage,
	targets []ChannelMessageTarget,
	onFailure func(targetID string),
) {
	for _, t := range targets {
		if t.Kind != "agent" {
			continue
		}
		var agentUUID pgtype.UUID
		if err := agentUUID.Scan(t.ID); err != nil {
			continue
		}
		agent, err := s.Queries.GetAgent(ctx, agentUUID)
		if err != nil || agent.ArchivedAt.Valid || !agent.RuntimeID.Valid {
			if onFailure != nil {
				onFailure(t.ID)
			}
			continue
		}
		task, err := s.Queries.CreateChannelTask(ctx, db.CreateChannelTaskParams{
			AgentID:          agentUUID,
			RuntimeID:        agent.RuntimeID,
			Priority:         2,
			ChannelID:        channelID,
			ChannelMessageID: msg.ID,
		})
		if err != nil {
			slog.Error("channel task enqueue failed",
				"channel_id", util.UUIDToString(channelID),
				"agent_id", t.ID,
				"error", err,
			)
			if onFailure != nil {
				onFailure(t.ID)
			}
			continue
		}
		slog.Info("channel task enqueued",
			"task_id", util.UUIDToString(task.ID),
			"channel_id", util.UUIDToString(channelID),
			"agent_id", t.ID,
		)
		s.NotifyTaskEnqueued(ctx, task)
	}
}

// targetsToJSON marshals targets for storage on channel_message.targets.
// Returns []byte("[]") on error so we never store NULL into the NOT NULL
// column.
func MarshalChannelTargets(targets []ChannelMessageTarget) []byte {
	if len(targets) == 0 {
		return []byte("[]")
	}
	raw, err := json.Marshal(targets)
	if err != nil {
		return []byte("[]")
	}
	return raw
}
