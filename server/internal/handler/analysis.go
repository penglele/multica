package handler

import (
	"net/http"
)

// BONCML Workspace P1 stub endpoints. They satisfy the productization
// requirement that TASKS / ARTIFACTS / AUDIT tabs read from a real API
// (returning an empty list today) instead of being purely static
// placeholders. The shape-stable contract is:
//
//   GET /api/channels/{channelId}/analysis-tasks         -> []
//   GET /api/channels/{channelId}/analysis-artifacts     -> []
//   GET /api/channels/{channelId}/analysis-audit-events  -> []
//
// All three accept the same path param (`channelId`, which is the room
// id at the product level) and return a JSON array. P2 introduces the
// `analysis_task` / `analysis_artifact` / `analysis_audit_event` tables
// and replaces these handlers with real query implementations; the
// frontend hooks should NOT need to change at that point — only the
// payload becomes non-empty.
//
// Authorization: we still need to gate access by channel
// membership/visibility once the real data lands. For the P1 stub the
// endpoints are workspace-scoped (auth + workspace slug header), which
// is consistent with the rest of the channel routes; the channel-level
// gate will be added with the real handler in P2.

func (h *Handler) ListAnalysisTasks(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []map[string]any{})
}

func (h *Handler) ListAnalysisArtifacts(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []map[string]any{})
}

func (h *Handler) ListAnalysisAuditEvents(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []map[string]any{})
}
