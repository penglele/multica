package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"

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

type sendChannelMessageRequest struct {
	Content        string  `json:"content"`
	ThreadParentID *string `json:"thread_parent_id"`
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

	msg, err := h.Queries.CreateChannelMessage(r.Context(), db.CreateChannelMessageParams{
		ChannelID:      channelID,
		SenderID:       parseUUID(userID),
		SenderType:     "human",
		Content:        req.Content,
		ThreadParentID: threadParentID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to send message")
		return
	}

	resp := channelMessageToResponse(msg)
	h.broadcastToChannel(uuidToString(channelID), protocol.EventChannelMessage, resp)

	// Trigger agents in background (copy context values needed).
	ctx := context.Background()
	go h.triggerChannelAgents(ctx, wsID, channelID, msg)

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

var atMentionRe = regexp.MustCompile(`@([\w\-\.]+)`)

func parseMentionedNames(content string) []string {
	matches := atMentionRe.FindAllStringSubmatch(content, -1)
	seen := make(map[string]bool)
	names := make([]string, 0, len(matches))
	for _, m := range matches {
		if len(m) > 1 && !seen[m[1]] {
			seen[m[1]] = true
			names = append(names, m[1])
		}
	}
	return names
}

// triggerChannelAgents decides which agents to trigger based on:
// 1. @mention in the message content
// 2. auto_reply mode on the channel (any human message triggers all agent members)
// Loop prevention: agent messages only trigger @mentioned agents, and only if
// the thread hasn't exceeded max_agent_turns.
func (h *Handler) triggerChannelAgents(ctx context.Context, wsID string, channelID pgtype.UUID, msg db.ChannelMessage) {
	ch, err := h.Queries.GetChannel(ctx, channelID)
	if err != nil {
		return
	}

	// Loop prevention: count agent turns in this thread.
	var threadRoot pgtype.UUID
	if msg.ThreadParentID.Valid {
		threadRoot = msg.ThreadParentID
	} else {
		threadRoot = msg.ID
	}
	agentTurns, err := h.Queries.CountAgentTurnsInThread(ctx, threadRoot)
	if err != nil {
		agentTurns = 0
	}
	maxTurns := int32(20)
	if ch.MaxAgentTurns > 0 {
		maxTurns = ch.MaxAgentTurns
	}
	if agentTurns >= maxTurns {
		slog.Info("channel agent trigger skipped: max turns reached",
			"channel_id", uuidToString(channelID),
			"turns", agentTurns,
			"max", maxTurns,
		)
		return
	}

	// Get all agent members of this channel.
	agentMembers, err := h.Queries.ListChannelAgentMembers(ctx, channelID)
	if err != nil || len(agentMembers) == 0 {
		return
	}

	// Build a map of agent name (lowercase) → agent record for @mention matching.
	type agentInfo struct {
		id      pgtype.UUID
		name    string
	}
	agentsByName := make(map[string]agentInfo)
	for _, memberID := range agentMembers {
		agent, err := h.Queries.GetAgent(ctx, memberID)
		if err != nil {
			continue
		}
		agentsByName[strings.ToLower(agent.Name)] = agentInfo{id: agent.ID, name: agent.Name}
	}

	// Determine which agents to trigger.
	var toTrigger []pgtype.UUID

	mentionedNames := parseMentionedNames(msg.Content)
	if len(mentionedNames) > 0 {
		// @mention mode: trigger only mentioned agents.
		for _, name := range mentionedNames {
			if info, ok := agentsByName[strings.ToLower(name)]; ok {
				toTrigger = append(toTrigger, info.id)
			}
		}
	} else if msg.SenderType == "human" && ch.AutoReply {
		// Auto-reply mode: trigger all agent members on human messages.
		for _, memberID := range agentMembers {
			toTrigger = append(toTrigger, memberID)
		}
	}

	if len(toTrigger) == 0 {
		return
	}

	for _, agentID := range toTrigger {
		agent, err := h.Queries.GetAgent(ctx, agentID)
		if err != nil || agent.ArchivedAt.Valid || !agent.RuntimeID.Valid {
			continue
		}
		task, err := h.Queries.CreateChannelTask(ctx, db.CreateChannelTaskParams{
			AgentID:          agentID,
			RuntimeID:        agent.RuntimeID,
			Priority:         2,
			ChannelID:        channelID,
			ChannelMessageID: msg.ID,
		})
		if err != nil {
			slog.Error("channel task enqueue failed",
				"channel_id", uuidToString(channelID),
				"agent_id", uuidToString(agentID),
				"error", err,
			)
			continue
		}
		slog.Info("channel task enqueued",
			"task_id", uuidToString(task.ID),
			"channel_id", uuidToString(channelID),
			"agent_id", uuidToString(agentID),
		)
		h.TaskService.NotifyTaskEnqueued(ctx, task)
	}
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

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
