package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

type createChannelRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Type        string `json:"type"` // public | private | dm
}

func (h *Handler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	wsID := ctxWorkspaceID(r.Context())
	wsUUID, ok := parseUUIDOrBadRequest(w, wsID, "workspace_id")
	if !ok {
		return
	}

	var req createChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Type == "" {
		req.Type = "public"
	}

	ch, err := h.Queries.CreateChannel(r.Context(), db.CreateChannelParams{
		WorkspaceID: wsUUID,
		Name:        req.Name,
		Description: pgtype.Text{String: req.Description, Valid: req.Description != ""},
		Type:        req.Type,
		CreatedBy:   parseUUID(userID),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create channel")
		return
	}

	// Auto-add creator as owner member.
	_ = h.Queries.AddChannelMember(r.Context(), db.AddChannelMemberParams{
		ChannelID:  ch.ID,
		MemberID:   parseUUID(userID),
		MemberType: "human",
		Role:       "owner",
	})

	h.broadcastChannelEvent(wsID, protocol.EventChannelCreated, map[string]any{"channel": channelToResponse(ch)})
	writeJSON(w, http.StatusCreated, channelToResponse(ch))
}

func (h *Handler) ListChannels(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	wsID := ctxWorkspaceID(r.Context())
	wsUUID, ok := parseUUIDOrBadRequest(w, wsID, "workspace_id")
	if !ok {
		return
	}

	channels, err := h.Queries.ListChannels(r.Context(), db.ListChannelsParams{
		WorkspaceID: wsUUID,
		MemberID:    parseUUID(userID),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list channels")
		return
	}

	resp := make([]map[string]any, 0, len(channels))
	for _, ch := range channels {
		resp = append(resp, channelToResponse(ch))
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) GetChannel(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspaceID(r.Context())
	wsUUID, ok := parseUUIDOrBadRequest(w, wsID, "workspace_id")
	if !ok {
		return
	}
	channelID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !ok {
		return
	}

	ch, err := h.Queries.GetChannelInWorkspace(r.Context(), db.GetChannelInWorkspaceParams{
		ID:          channelID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "channel not found")
		} else {
			writeError(w, http.StatusInternalServerError, "failed to get channel")
		}
		return
	}
	writeJSON(w, http.StatusOK, channelToResponse(ch))
}

type updateChannelRequest struct {
	Name          *string `json:"name"`
	Description   *string `json:"description"`
	AutoReply     *bool   `json:"auto_reply"`
	MaxAgentTurns *int32  `json:"max_agent_turns"`
}

func (h *Handler) UpdateChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	wsID := ctxWorkspaceID(r.Context())
	channelID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !ok {
		return
	}

	// Only channel owner can update.
	member, err := h.Queries.GetChannelMember(r.Context(), db.GetChannelMemberParams{
		ChannelID: channelID,
		MemberID:  parseUUID(userID),
	})
	if err != nil || member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only channel owner can update channel")
		return
	}

	var req updateChannelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ch, err := h.Queries.UpdateChannel(r.Context(), db.UpdateChannelParams{
		ID:            channelID,
		Name:          pgtype.Text{String: strDeref(req.Name), Valid: req.Name != nil},
		Description:   pgtype.Text{String: strDeref(req.Description), Valid: req.Description != nil},
		AutoReply:     pgtype.Bool{Bool: boolDeref(req.AutoReply), Valid: req.AutoReply != nil},
		MaxAgentTurns: pgtype.Int4{Int32: int32Deref(req.MaxAgentTurns), Valid: req.MaxAgentTurns != nil},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update channel")
		return
	}

	h.broadcastChannelEvent(wsID, protocol.EventChannelUpdated, map[string]any{"channel": channelToResponse(ch)})
	writeJSON(w, http.StatusOK, channelToResponse(ch))
}

func (h *Handler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	wsID := ctxWorkspaceID(r.Context())
	channelID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !ok {
		return
	}

	member, err := h.Queries.GetChannelMember(r.Context(), db.GetChannelMemberParams{
		ChannelID: channelID,
		MemberID:  parseUUID(userID),
	})
	if err != nil || member.Role != "owner" {
		writeError(w, http.StatusForbidden, "only channel owner can delete channel")
		return
	}

	if err := h.Queries.DeleteChannel(r.Context(), channelID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete channel")
		return
	}

	h.broadcastChannelEvent(wsID, protocol.EventChannelDeleted, map[string]any{"channel_id": uuidToString(channelID)})
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Channel Members
// ---------------------------------------------------------------------------

type addChannelMemberRequest struct {
	MemberID   string `json:"member_id"`
	MemberType string `json:"member_type"` // human | agent
}

func (h *Handler) AddChannelMember(w http.ResponseWriter, r *http.Request) {
	channelID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !ok {
		return
	}

	var req addChannelMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	memberUUID, ok := parseUUIDOrBadRequest(w, req.MemberID, "member_id")
	if !ok {
		return
	}
	if req.MemberType != "human" && req.MemberType != "agent" {
		writeError(w, http.StatusBadRequest, "member_type must be human or agent")
		return
	}

	if err := h.Queries.AddChannelMember(r.Context(), db.AddChannelMemberParams{
		ChannelID:  channelID,
		MemberID:   memberUUID,
		MemberType: req.MemberType,
		Role:       "member",
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RemoveChannelMember(w http.ResponseWriter, r *http.Request) {
	channelID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !ok {
		return
	}
	memberID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "memberId"), "memberId")
	if !ok {
		return
	}

	if err := h.Queries.RemoveChannelMember(r.Context(), db.RemoveChannelMemberParams{
		ChannelID: channelID,
		MemberID:  memberID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListChannelMembers(w http.ResponseWriter, r *http.Request) {
	channelID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !ok {
		return
	}

	members, err := h.Queries.ListChannelMembers(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list members")
		return
	}
	writeJSON(w, http.StatusOK, members)
}

// ---------------------------------------------------------------------------
// Channel Messages
// ---------------------------------------------------------------------------

// ChannelMessageTarget represents one agent (or future kind) that's been
// selected to handle a channel message. Returned in the send response so
// the user immediately sees who their message went to.
type ChannelMessageTarget struct {
	Kind   string `json:"kind"`   // "agent" (squads coming later)
	ID     string `json:"id"`     // agent UUID
	Name   string `json:"name"`   // display name for UI
	TaskID string `json:"task_id,omitempty"` // populated once enqueued
	Status string `json:"status"` // "queued" | "running" | "completed" | "failed" | "cancelled"
}

// SendChannelMessageTargetSpec is the structured target a client sends in
// the request when trigger_mode="manual". Only kind and id are required —
// the server resolves name and validates membership.
type SendChannelMessageTargetSpec struct {
	Kind string `json:"kind"` // "agent"
	ID   string `json:"id"`
}

type sendChannelMessageRequest struct {
	Content        string  `json:"content"`
	ThreadParentID *string `json:"thread_parent_id"`

	// B1 structured trigger fields. All optional — when none are provided
	// the server falls back to the B0 path (auto_reply flag + @mention parse)
	// so older clients keep working unchanged.
	ClientMessageID *string                        `json:"client_message_id,omitempty"`
	TriggerMode     *string                        `json:"trigger_mode,omitempty"` // "none" | "manual" | "auto"
	Targets         []SendChannelMessageTargetSpec `json:"targets,omitempty"`
}

func (h *Handler) SendChannelMessage(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	wsID := ctxWorkspaceID(r.Context())
	channelID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !ok {
		return
	}

	var req sendChannelMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Content == "" {
		writeError(w, http.StatusBadRequest, "content is required")
		return
	}

	var threadParentID pgtype.UUID
	if req.ThreadParentID != nil {
		tid, ok := parseUUIDOrBadRequest(w, *req.ThreadParentID, "thread_parent_id")
		if !ok {
			return
		}
		threadParentID = tid
	}

	// B1 idempotency: if client_message_id is set and we've already accepted
	// this message, return the existing row. Avoids creating duplicates on
	// network retries.
	var clientMessageID pgtype.Text
	if req.ClientMessageID != nil && *req.ClientMessageID != "" {
		clientMessageID = pgtype.Text{String: *req.ClientMessageID, Valid: true}
		existing, err := h.Queries.GetChannelMessageByClientID(r.Context(), db.GetChannelMessageByClientIDParams{
			ChannelID:       channelID,
			ClientMessageID: clientMessageID,
		})
		if err == nil {
			writeJSON(w, http.StatusOK, channelMessageToResponse(existing))
			return
		}
	}

	msg, err := h.Queries.CreateChannelMessage(r.Context(), db.CreateChannelMessageParams{
		ChannelID:       channelID,
		SenderID:        parseUUID(userID),
		SenderType:      "human",
		Content:         req.Content,
		ThreadParentID:  threadParentID,
		Targets:         []byte("[]"),
		ClientMessageID: clientMessageID,
	})
	if err != nil {
		// Race-safe idempotency: if we lost the race against a concurrent
		// retry that beat us to the unique index, the create returns 23505.
		// Treat that as success and return the row that did get inserted.
		if clientMessageID.Valid && isUniqueViolation(err) {
			existing, lookupErr := h.Queries.GetChannelMessageByClientID(r.Context(), db.GetChannelMessageByClientIDParams{
				ChannelID:       channelID,
				ClientMessageID: clientMessageID,
			})
			if lookupErr == nil {
				writeJSON(w, http.StatusOK, channelMessageToResponse(existing))
				return
			}
			slog.Warn("channel send: unique violation but lookup failed",
				"channel_id", uuidToString(channelID),
				"client_message_id", clientMessageID.String,
				"lookup_err", lookupErr,
			)
		}
		slog.Error("channel send: create message failed",
			"channel_id", uuidToString(channelID),
			"error", err,
		)
		writeError(w, http.StatusInternalServerError, "failed to send message")
		return
	}

	// B1: Resolve targets — structured request fields take precedence over
	// the old @mention/auto_reply fallback. resolveChannelTargets reads
	// req.TriggerMode and req.Targets when present; falls back otherwise.
	targets := h.resolveChannelTargets(r.Context(), channelID, msg, req.TriggerMode, req.Targets)

	// Persist targets on the message so they survive page refresh.
	if len(targets) > 0 {
		if raw, err := json.Marshal(targets); err == nil {
			if updated, err := h.Queries.UpdateChannelMessageTargets(r.Context(), db.UpdateChannelMessageTargetsParams{
				ID:      msg.ID,
				Targets: raw,
			}); err == nil {
				msg = updated
			}
		}
	}

	resp := channelMessageToResponse(msg)
	resp["targets"] = targets
	h.broadcastToChannel(uuidToString(channelID), protocol.EventChannelMessage, resp)

	// Enqueue the actual tasks in the background — they're already
	// promised in the response above, so users see "queued" immediately
	// and can watch the status flip via WS events.
	if len(targets) > 0 {
		ctx := context.Background()
		go h.enqueueChannelTargets(ctx, wsID, channelID, msg, targets)
	}

	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) ListChannelMessages(w http.ResponseWriter, r *http.Request) {
	channelID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !ok {
		return
	}

	limit := int32(50)
	offset := int32(0)
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = int32(n)
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = int32(n)
		}
	}

	msgs, err := h.Queries.ListChannelMessages(r.Context(), db.ListChannelMessagesParams{
		ChannelID: channelID,
		Limit:     limit,
		Offset:    offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list messages")
		return
	}

	resp := make([]map[string]any, 0, len(msgs))
	for _, m := range msgs {
		resp = append(resp, channelMessageToResponse(m))
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) ListThreadReplies(w http.ResponseWriter, r *http.Request) {
	parentID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "messageId"), "messageId")
	if !ok {
		return
	}

	msgs, err := h.Queries.ListThreadReplies(r.Context(), parentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list replies")
		return
	}

	resp := make([]map[string]any, 0, len(msgs))
	for _, m := range msgs {
		resp = append(resp, channelMessageToResponse(m))
	}
	writeJSON(w, http.StatusOK, resp)
}

// ---------------------------------------------------------------------------
// Read state
// ---------------------------------------------------------------------------

type markChannelReadRequest struct {
	LastReadSeq int64 `json:"last_read_seq"`
}

func (h *Handler) MarkChannelRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	channelID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !ok {
		return
	}

	var req markChannelReadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.Queries.UpsertChannelReadState(r.Context(), db.UpsertChannelReadStateParams{
		ChannelID:   channelID,
		UserID:      parseUUID(userID),
		LastReadSeq: req.LastReadSeq,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mark read")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Agent trigger logic (Phase 4)
// ---------------------------------------------------------------------------

func parseMentionedNames(content string, candidates []string) []string {
	if content == "" || len(candidates) == 0 {
		return nil
	}

	sorted := append([]string(nil), candidates...)
	sort.SliceStable(sorted, func(i, j int) bool {
		return utf8.RuneCountInString(sorted[i]) > utf8.RuneCountInString(sorted[j])
	})

	lowerContent := strings.ToLower(content)
	seen := make(map[string]bool, len(sorted))
	names := make([]string, 0, len(sorted))

	for i := 0; i < len(lowerContent); {
		r, size := utf8.DecodeRuneInString(lowerContent[i:])
		if r != '@' {
			i += size
			continue
		}

		rest := lowerContent[i+size:]
		matched := ""
		for _, candidate := range sorted {
			lowerCandidate := strings.ToLower(candidate)
			if !strings.HasPrefix(rest, lowerCandidate) {
				continue
			}
			if !isMentionBoundary(rest[len(lowerCandidate):]) {
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
			names = append(names, matched)
		}
		i += size + len(strings.ToLower(matched))
	}

	return names
}

func isMentionBoundary(rest string) bool {
	if rest == "" {
		return true
	}
	r, _ := utf8.DecodeRuneInString(rest)
	return unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r)
}

// channelAgentRow is a slim view of an agent — used internally during target
// resolution so we don't pass full db.Agent rows around.
type channelAgentRow struct {
	id   pgtype.UUID
	name string
}

// resolveChannelTargets decides which agents should respond to a message.
// Returns a list of ChannelMessageTarget with status="queued" — these are
// the agents that WILL be enqueued. Loop prevention and channel state are
// checked here, so an empty result means "no one responds" (not an error).
//
// B1 priority order:
//
//  1. If the request body specified `trigger_mode`, use it as the source of
//     truth (`none` → no targets, `manual` → request `targets`, `auto` →
//     all agent members).
//  2. Otherwise (older clients or unset), fall back to the B0 implicit
//     behaviour: `@name` parse + channel.auto_reply flag.
//
// `triggerMode` and `requestedTargets` come straight from the request body.
// They are nil/empty for legacy clients.
func (h *Handler) resolveChannelTargets(
	ctx context.Context,
	channelID pgtype.UUID,
	msg db.ChannelMessage,
	triggerMode *string,
	requestedTargets []SendChannelMessageTargetSpec,
) []ChannelMessageTarget {
	ch, err := h.Queries.GetChannel(ctx, channelID)
	if err != nil {
		return nil
	}

	// Loop prevention: cap agent turns per thread.
	var threadRoot pgtype.UUID
	if msg.ThreadParentID.Valid {
		threadRoot = msg.ThreadParentID
	} else {
		threadRoot = msg.ID
	}
	agentTurns, _ := h.Queries.CountAgentTurnsInThread(ctx, threadRoot)
	maxTurns := int32(20)
	if ch.MaxAgentTurns > 0 {
		maxTurns = ch.MaxAgentTurns
	}
	if agentTurns >= maxTurns {
		slog.Info("channel target resolve: max agent turns reached",
			"channel_id", uuidToString(channelID),
			"turns", agentTurns,
			"max", maxTurns,
		)
		return nil
	}

	// Load agent members of this channel — needed for both paths to
	// validate target IDs and look up display names.
	agentMemberIDs, err := h.Queries.ListChannelAgentMembers(ctx, channelID)
	if err != nil || len(agentMemberIDs) == 0 {
		return nil
	}

	agentsByName := make(map[string]channelAgentRow, len(agentMemberIDs))
	idToAgent := make(map[string]channelAgentRow, len(agentMemberIDs))
	candidateNames := make([]string, 0, len(agentMemberIDs))
	memberIDStrs := make(map[string]bool, len(agentMemberIDs))
	for _, memberID := range agentMemberIDs {
		agent, err := h.Queries.GetAgent(ctx, memberID)
		if err != nil || agent.ArchivedAt.Valid || !agent.RuntimeID.Valid {
			continue
		}
		row := channelAgentRow{id: agent.ID, name: agent.Name}
		agentsByName[strings.ToLower(agent.Name)] = row
		idStr := uuidToString(agent.ID)
		idToAgent[idStr] = row
		memberIDStrs[idStr] = true
		candidateNames = append(candidateNames, agent.Name)
	}

	// Path 1: structured trigger_mode
	if triggerMode != nil {
		mode := strings.ToLower(strings.TrimSpace(*triggerMode))
		switch mode {
		case "none":
			return nil
		case "manual":
			return resolveManualTargets(requestedTargets, idToAgent, memberIDStrs)
		case "auto":
			return resolveAutoTargets(idToAgent, agentMemberIDs)
		default:
			// Unknown mode — be permissive and fall through to the legacy path
			// rather than 400-ing. This keeps older clients working when a
			// future mode name leaks into the protocol.
			slog.Warn("unknown channel trigger_mode, falling back to legacy resolution",
				"channel_id", uuidToString(channelID),
				"trigger_mode", mode,
			)
		}
	}

	// Path 2: legacy fallback — @mention first, then channel auto_reply.
	if mentionedNames := parseMentionedNames(msg.Content, candidateNames); len(mentionedNames) > 0 {
		picked := make([]ChannelMessageTarget, 0, len(mentionedNames))
		for _, name := range mentionedNames {
			if row, ok := agentsByName[strings.ToLower(name)]; ok {
				picked = append(picked, ChannelMessageTarget{
					Kind: "agent", ID: uuidToString(row.id), Name: row.name, Status: "queued",
				})
			}
		}
		return picked
	}
	if msg.SenderType == "human" && ch.AutoReply {
		return resolveAutoTargets(idToAgent, agentMemberIDs)
	}
	return nil
}

// resolveManualTargets validates that each requested target is a current
// agent member of the channel and returns the matching list. Targets that
// don't match are silently dropped (the request is not rejected — partial
// resolution is more useful than a hard fail).
func resolveManualTargets(
	requested []SendChannelMessageTargetSpec,
	idToAgent map[string]channelAgentRow,
	memberIDStrs map[string]bool,
) []ChannelMessageTarget {
	out := make([]ChannelMessageTarget, 0, len(requested))
	seen := make(map[string]bool, len(requested))
	for _, t := range requested {
		if t.Kind != "agent" {
			continue // squads/other kinds not supported yet
		}
		if !memberIDStrs[t.ID] {
			continue // not a current channel member
		}
		if seen[t.ID] {
			continue
		}
		row, ok := idToAgent[t.ID]
		if !ok {
			continue
		}
		seen[t.ID] = true
		out = append(out, ChannelMessageTarget{
			Kind:   "agent",
			ID:     t.ID,
			Name:   row.name,
			Status: "queued",
		})
	}
	return out
}

// resolveAutoTargets fans out to every agent member of the channel.
func resolveAutoTargets(
	idToAgent map[string]channelAgentRow,
	agentMemberIDs []pgtype.UUID,
) []ChannelMessageTarget {
	out := make([]ChannelMessageTarget, 0, len(agentMemberIDs))
	for _, memberID := range agentMemberIDs {
		row, ok := idToAgent[uuidToString(memberID)]
		if !ok {
			continue // archived / no runtime
		}
		out = append(out, ChannelMessageTarget{
			Kind: "agent", ID: uuidToString(row.id), Name: row.name, Status: "queued",
		})
	}
	return out
}

// enqueueChannelTargets actually inserts agent_task_queue rows for the
// resolved targets and notifies the daemon. Runs asynchronously so the
// HTTP handler can return immediately with the resolved targets.
func (h *Handler) enqueueChannelTargets(ctx context.Context, wsID string, channelID pgtype.UUID, msg db.ChannelMessage, targets []ChannelMessageTarget) {
	for _, t := range targets {
		if t.Kind != "agent" {
			continue
		}
		agentUUID, err := pgtypeUUIDFromString(t.ID)
		if err != nil {
			continue
		}
		agent, err := h.Queries.GetAgent(ctx, agentUUID)
		if err != nil || agent.ArchivedAt.Valid || !agent.RuntimeID.Valid {
			continue
		}
		task, err := h.Queries.CreateChannelTask(ctx, db.CreateChannelTaskParams{
			AgentID:          agentUUID,
			RuntimeID:        agent.RuntimeID,
			Priority:         2,
			ChannelID:        channelID,
			ChannelMessageID: msg.ID,
		})
		if err != nil {
			slog.Error("channel task enqueue failed",
				"channel_id", uuidToString(channelID),
				"agent_id", t.ID,
				"error", err,
			)
			// Broadcast failure so the UI doesn't show "排队中" forever.
			h.broadcastChannelTargetStatus(uuidToString(channelID), uuidToString(msg.ID), "", t.ID, "failed")
			continue
		}
		slog.Info("channel task enqueued",
			"task_id", uuidToString(task.ID),
			"channel_id", uuidToString(channelID),
			"agent_id", t.ID,
		)
		h.TaskService.NotifyTaskEnqueued(ctx, task)
	}
}

func pgtypeUUIDFromString(s string) (pgtype.UUID, error) {
	var u pgtype.UUID
	if err := u.Scan(s); err != nil {
		return u, err
	}
	return u, nil
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

// broadcastChannelTargetStatus sends a channel:target_update event and
// persists the new status on the message row so page refresh is consistent.
func (h *Handler) broadcastChannelTargetStatus(channelID, messageID, taskID, agentID, status string) {
	payload := map[string]any{
		"channel_id":         channelID,
		"channel_message_id": messageID,
		"task_id":            taskID,
		"target_kind":        "agent",
		"target_id":          agentID,
		"status":             status,
	}
	if data, err := marshalEvent("channel:target_update", payload); err == nil {
		h.Hub.BroadcastToScope("channel", channelID, data)
	}
	// Persist so refresh shows correct state.
	msgUUID, err := pgtypeUUIDFromString(messageID)
	if err != nil {
		return
	}
	msg, err := h.Queries.GetChannelMessage(context.Background(), msgUUID)
	if err != nil {
		return
	}
	var targets []map[string]any
	if len(msg.Targets) > 0 {
		_ = json.Unmarshal(msg.Targets, &targets)
	}
	for i, t := range targets {
		if t["kind"] == "agent" && t["id"] == agentID {
			targets[i]["status"] = status
			if taskID != "" {
				targets[i]["task_id"] = taskID
			}
			break
		}
	}
	if raw, err := json.Marshal(targets); err == nil {
		_, _ = h.Queries.UpdateChannelMessageTargets(context.Background(), db.UpdateChannelMessageTargetsParams{
			ID:      msgUUID,
			Targets: raw,
		})
	}
}

func (h *Handler) broadcastChannelEvent(wsID, eventType string, payload any) {
	data, err := marshalEvent(eventType, payload)
	if err != nil {
		return
	}
	h.Hub.BroadcastToWorkspace(wsID, data)
}

func (h *Handler) broadcastToChannel(channelID, eventType string, payload any) {
	data, err := marshalEvent(eventType, payload)
	if err != nil {
		return
	}
	h.Hub.BroadcastToScope("channel", channelID, data)
}

func marshalEvent(eventType string, payload any) ([]byte, error) {
	return json.Marshal(map[string]any{
		"type":    eventType,
		"payload": payload,
	})
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

func channelToResponse(ch db.Channel) map[string]any {
	return map[string]any{
		"id":              uuidToString(ch.ID),
		"workspace_id":    uuidToString(ch.WorkspaceID),
		"name":            ch.Name,
		"description":     ch.Description.String,
		"type":            ch.Type,
		"auto_reply":      ch.AutoReply,
		"max_agent_turns": ch.MaxAgentTurns,
		"created_by":      uuidToString(ch.CreatedBy),
		"created_at":      ch.CreatedAt.Time,
		"updated_at":      ch.UpdatedAt.Time,
	}
}

func channelMessageToResponse(m db.ChannelMessage) map[string]any {
	resp := map[string]any{
		"id":          uuidToString(m.ID),
		"channel_id":  uuidToString(m.ChannelID),
		"sender_id":   uuidToString(m.SenderID),
		"sender_type": m.SenderType,
		"content":     m.Content,
		"seq":         m.Seq,
		"created_at":  m.CreatedAt.Time,
		"updated_at":  m.UpdatedAt.Time,
	}
	if m.ThreadParentID.Valid {
		resp["thread_parent_id"] = uuidToString(m.ThreadParentID)
	}
	if m.TaskID.Valid {
		resp["task_id"] = uuidToString(m.TaskID)
	}
	if m.ClientMessageID.Valid {
		resp["client_message_id"] = m.ClientMessageID.String
	}
	// Include persisted targets so history queries return them too.
	if len(m.Targets) > 0 && string(m.Targets) != "[]" {
		var targets []ChannelMessageTarget
		if err := json.Unmarshal(m.Targets, &targets); err == nil && len(targets) > 0 {
			resp["targets"] = targets
		}
	}
	return resp
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

func strDeref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func boolDeref(b *bool) bool {
	if b == nil {
		return false
	}
	return *b
}

func int32Deref(i *int32) int32 {
	if i == nil {
		return 0
	}
	return *i
}
