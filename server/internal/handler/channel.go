package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/internal/service"
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
	Name              *string `json:"name"`
	Description       *string `json:"description"`
	AutoReply         *bool   `json:"auto_reply"`
	MaxAgentTurns     *int32  `json:"max_agent_turns"`
	AutoReplyStrategy *string `json:"auto_reply_strategy"` // "all_agents" | "default_agent"
	DefaultTargetID   *string `json:"default_target_id"`
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

	// Validate enum values before sending to DB.
	if req.AutoReplyStrategy != nil {
		v := *req.AutoReplyStrategy
		if v != "all_agents" && v != "default_agent" {
			writeError(w, http.StatusBadRequest, "auto_reply_strategy must be 'all_agents' or 'default_agent'")
			return
		}
	}
	var defaultTargetUUID pgtype.UUID
	if req.DefaultTargetID != nil && *req.DefaultTargetID != "" {
		parsed, err := pgtypeUUIDFromString(*req.DefaultTargetID)
		if err != nil {
			writeError(w, http.StatusBadRequest, "default_target_id is not a valid UUID")
			return
		}
		defaultTargetUUID = parsed
	}

	// Cross-field consistency: a "default_agent" strategy is meaningless
	// without a default_target_id. We compute the EFFECTIVE post-PATCH
	// state (existing values + this request's overrides) and reject the
	// update if it would leave the channel in a silently broken config —
	// strategy says "fan to one agent" but there's no agent to fan to.
	current, err := h.Queries.GetChannel(r.Context(), channelID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load channel")
		return
	}

	// Auto-fallback FIRST: when the caller explicitly clears
	// default_target_id (sends "") while the channel is currently in
	// default_agent strategy AND they didn't simultaneously change the
	// strategy, force-flip back to all_agents. This prevents the
	// validation below from 400-ing a "just clear my default agent"
	// intent — the user obviously wants the channel to keep working.
	if req.DefaultTargetID != nil && *req.DefaultTargetID == "" &&
		req.AutoReplyStrategy == nil && current.AutoReplyStrategy == "default_agent" {
		fallback := "all_agents"
		req.AutoReplyStrategy = &fallback
	}

	effectiveStrategy := current.AutoReplyStrategy
	if req.AutoReplyStrategy != nil {
		effectiveStrategy = *req.AutoReplyStrategy
	}
	effectiveDefaultValid := current.DefaultTargetID.Valid
	if req.DefaultTargetID != nil {
		effectiveDefaultValid = *req.DefaultTargetID != ""
	}
	if effectiveStrategy == "default_agent" && !effectiveDefaultValid {
		writeError(w, http.StatusBadRequest,
			"auto_reply_strategy='default_agent' requires default_target_id (set them together, or switch to 'all_agents')")
		return
	}

	ch, err := h.Queries.UpdateChannel(r.Context(), db.UpdateChannelParams{
		ID:                channelID,
		Name:              pgtype.Text{String: strDeref(req.Name), Valid: req.Name != nil},
		Description:       pgtype.Text{String: strDeref(req.Description), Valid: req.Description != nil},
		AutoReply:         pgtype.Bool{Bool: boolDeref(req.AutoReply), Valid: req.AutoReply != nil},
		MaxAgentTurns:     pgtype.Int4{Int32: int32Deref(req.MaxAgentTurns), Valid: req.MaxAgentTurns != nil},
		AutoReplyStrategy: pgtype.Text{String: strDeref(req.AutoReplyStrategy), Valid: req.AutoReplyStrategy != nil},
		DefaultTargetID:   defaultTargetUUID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update channel")
		return
	}

	// Explicit clear of default_target_id can't go through UpdateChannel
	// (COALESCE-on-narg keeps the old value). Run a dedicated query so the
	// final stored row matches the user's intent.
	if req.DefaultTargetID != nil && *req.DefaultTargetID == "" {
		if err := h.Queries.ClearChannelDefaultTarget(r.Context(), channelID); err != nil {
			slog.Warn("failed to clear default_target_id",
				"channel_id", uuidToString(channelID),
				"error", err,
			)
		} else {
			// Re-read to reflect the cleared value in the response.
			if reread, rerr := h.Queries.GetChannel(r.Context(), channelID); rerr == nil {
				ch = reread
			}
		}
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

// ChannelMessageTarget is re-exported from the service package so existing
// handler-side helpers (broadcastChannelTargetStatus, channelMessageToResponse)
// keep working unchanged. Resolution and enqueueing logic now lives in
// service/channel_targets.go (B2).
type ChannelMessageTarget = service.ChannelMessageTarget

// SendChannelMessageTargetSpec is the structured target a client sends in
// the request when trigger_mode="manual". Aliased to the service type so
// the JSON shape stays identical.
type SendChannelMessageTargetSpec = service.ChannelTargetSpec

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

	// B2: Resolve targets via the service-layer function. Structured
	// trigger_mode + targets take precedence; legacy @mention/auto_reply
	// is the fallback for older clients. See service/channel_targets.go.
	targets := service.ResolveChannelTargets(r.Context(), h.Queries, service.ResolveChannelTargetsInput{
		ChannelID:   channelID,
		Message:     msg,
		TriggerMode: req.TriggerMode,
		Targets:     req.Targets,
	})

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
		channelIDStr := uuidToString(channelID)
		messageIDStr := uuidToString(msg.ID)
		go h.TaskService.EnqueueChannelTargets(ctx, channelID, msg, targets, func(targetID string) {
			// On enqueue failure, broadcast and persist a `failed` status
			// for that specific target so the UI doesn't hang on `排队中`.
			h.broadcastChannelTargetStatus(channelIDStr, messageIDStr, "", targetID, "failed")
		})
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
	resp := map[string]any{
		"id":                  uuidToString(ch.ID),
		"workspace_id":        uuidToString(ch.WorkspaceID),
		"name":                ch.Name,
		"description":         ch.Description.String,
		"type":                ch.Type,
		"auto_reply":          ch.AutoReply,
		"max_agent_turns":     ch.MaxAgentTurns,
		"auto_reply_strategy": ch.AutoReplyStrategy,
		"created_by":          uuidToString(ch.CreatedBy),
		"created_at":          ch.CreatedAt.Time,
		"updated_at":          ch.UpdatedAt.Time,
	}
	if ch.DefaultTargetID.Valid {
		resp["default_target_id"] = uuidToString(ch.DefaultTargetID)
	}
	return resp
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
