package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// BONCML Workspace P2 — analysis-task / artifact / audit list
// endpoints. All three are scoped per room (channel id) and gated by
// workspace + channel existence checks. Listing returns the most
// recent N rows per the limit query param (default 100, capped at
// 500).

const (
	analysisListDefaultLimit = int32(100)
	analysisListMaxLimit     = int32(500)
)

func (h *Handler) ListAnalysisTasks(w http.ResponseWriter, r *http.Request) {
	channelID, ok := h.gateAnalysisRoom(w, r)
	if !ok {
		return
	}
	limit := parseAnalysisLimit(r)

	tasks, err := h.Queries.ListAnalysisTasksForRoom(r.Context(), db.ListAnalysisTasksForRoomParams{
		RoomID: channelID,
		Limit:  limit,
	})
	if err != nil {
		slog.Error("ListAnalysisTasksForRoom failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list analysis tasks")
		return
	}

	resp := make([]map[string]any, 0, len(tasks))
	for _, t := range tasks {
		resp = append(resp, analysisTaskToResponse(t))
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) ListAnalysisArtifacts(w http.ResponseWriter, r *http.Request) {
	channelID, ok := h.gateAnalysisRoom(w, r)
	if !ok {
		return
	}
	limit := parseAnalysisLimit(r)

	rows, err := h.Queries.ListAnalysisArtifactsForRoom(r.Context(), db.ListAnalysisArtifactsForRoomParams{
		RoomID: channelID,
		Limit:  limit,
	})
	if err != nil {
		slog.Error("ListAnalysisArtifactsForRoom failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list analysis artifacts")
		return
	}

	resp := make([]map[string]any, 0, len(rows))
	for _, a := range rows {
		resp = append(resp, analysisArtifactToResponse(a))
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) ListAnalysisAuditEvents(w http.ResponseWriter, r *http.Request) {
	channelID, ok := h.gateAnalysisRoom(w, r)
	if !ok {
		return
	}
	limit := parseAnalysisLimit(r)

	rows, err := h.Queries.ListAnalysisAuditEventsForRoom(r.Context(), db.ListAnalysisAuditEventsForRoomParams{
		RoomID: channelID,
		Limit:  limit,
	})
	if err != nil {
		slog.Error("ListAnalysisAuditEventsForRoom failed", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to list analysis audit events")
		return
	}

	resp := make([]map[string]any, 0, len(rows))
	for _, e := range rows {
		resp = append(resp, analysisAuditEventToResponse(e))
	}
	writeJSON(w, http.StatusOK, resp)
}

// gateAnalysisRoom resolves the channelId path param, validates auth,
// and confirms the channel exists in the requesting user's workspace.
// Returns the channel UUID + ok flag. Writes the error response itself
// when not ok.
//
// We deliberately don't gate on channel_member here: the analysis
// surface is part of the workspace's BONCML view, and within a public
// channel any workspace member is allowed to read the analysis state.
// Private-room scoping lands when private rooms grow real product
// distinction (P3+).
func (h *Handler) gateAnalysisRoom(w http.ResponseWriter, r *http.Request) (pgtype.UUID, bool) {
	if _, authed := requireUserID(w, r); !authed {
		return pgtype.UUID{}, false
	}
	cid, parsed := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !parsed {
		return pgtype.UUID{}, false
	}
	wsID := ctxWorkspaceID(r.Context())
	wsUUID, parsedWS := parseUUIDOrBadRequest(w, wsID, "workspace_id")
	if !parsedWS {
		return pgtype.UUID{}, false
	}
	if _, err := h.Queries.GetChannelInWorkspace(r.Context(), db.GetChannelInWorkspaceParams{
		ID:          cid,
		WorkspaceID: wsUUID,
	}); err != nil {
		writeError(w, http.StatusNotFound, "room not found")
		return pgtype.UUID{}, false
	}
	return cid, true
}

func parseAnalysisLimit(r *http.Request) int32 {
	v := r.URL.Query().Get("limit")
	if v == "" {
		return analysisListDefaultLimit
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return analysisListDefaultLimit
	}
	if n > int(analysisListMaxLimit) {
		return analysisListMaxLimit
	}
	return int32(n)
}

// ---------------------------------------------------------------------------
// Response shapers
// ---------------------------------------------------------------------------

func analysisTaskToResponse(t db.AnalysisTask) map[string]any {
	resp := map[string]any{
		"id":                 uuidToString(t.ID),
		"workspace_id":       uuidToString(t.WorkspaceID),
		"room_id":            uuidToString(t.RoomID),
		"business_question":  t.BusinessQuestion,
		"current_stage":      t.CurrentStage,
		"requires_approval":  t.RequiresApproval,
		"created_by_type":    t.CreatedByType,
		"created_at":         t.CreatedAt.Time,
		"updated_at":         t.UpdatedAt.Time,
	}
	if t.IssueID.Valid {
		resp["issue_id"] = uuidToString(t.IssueID)
	}
	if t.SquadID.Valid {
		resp["squad_id"] = uuidToString(t.SquadID)
	}
	if t.CreatedByID.Valid {
		resp["created_by_id"] = uuidToString(t.CreatedByID)
	}
	return resp
}

func analysisArtifactToResponse(a db.AnalysisArtifact) map[string]any {
	resp := map[string]any{
		"id":                uuidToString(a.ID),
		"workspace_id":      uuidToString(a.WorkspaceID),
		"analysis_task_id":  uuidToString(a.AnalysisTaskID),
		"type":              a.Type,
		"title":             a.Title,
		"status":            a.Status,
		"version":           a.Version,
		"created_by_type":   a.CreatedByType,
		"created_at":        a.CreatedAt.Time,
		"updated_at":        a.UpdatedAt.Time,
	}
	// payload + file_refs are JSONB; pass through verbatim. Empty
	// objects/arrays still serialize as `{}` / `[]`, which is what
	// the frontend expects.
	var payload any
	if len(a.Payload) > 0 {
		_ = json.Unmarshal(a.Payload, &payload)
	}
	resp["payload"] = payload
	var fileRefs any
	if len(a.FileRefs) > 0 {
		_ = json.Unmarshal(a.FileRefs, &fileRefs)
	}
	resp["file_refs"] = fileRefs
	if a.CreatedByID.Valid {
		resp["created_by_id"] = uuidToString(a.CreatedByID)
	}
	return resp
}

func analysisAuditEventToResponse(e db.AnalysisAuditEvent) map[string]any {
	resp := map[string]any{
		"id":           uuidToString(e.ID),
		"workspace_id": uuidToString(e.WorkspaceID),
		"actor_type":   e.ActorType,
		"action":       e.Action,
		"created_at":   e.CreatedAt.Time,
	}
	if e.AnalysisTaskID.Valid {
		resp["analysis_task_id"] = uuidToString(e.AnalysisTaskID)
	}
	if e.ArtifactID.Valid {
		resp["artifact_id"] = uuidToString(e.ArtifactID)
	}
	if e.ActorID.Valid {
		resp["actor_id"] = uuidToString(e.ActorID)
	}
	if e.TargetType.Valid {
		resp["target_type"] = e.TargetType.String
	}
	if e.TargetID.Valid {
		resp["target_id"] = uuidToString(e.TargetID)
	}
	if e.RuntimeVersion.Valid {
		resp["runtime_version"] = e.RuntimeVersion.String
	}
	var details any
	if len(e.Details) > 0 {
		_ = json.Unmarshal(e.Details, &details)
	}
	resp["details"] = details
	return resp
}
