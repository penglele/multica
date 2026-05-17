-- BONCML Workspace P2 queries. Scoped per room (channel) for the
-- list endpoints since the Workspace UI renders all three tabs in the
-- context of a single room. Workspace-wide queries can be added later
-- when we build the Workspace-level dashboard.

-- name: ListAnalysisTasksForRoom :many
-- All analysis tasks attached to a room, newest-first. Joins squad to
-- surface the Agent Team name without a second round-trip.
SELECT
  t.*,
  s.name AS squad_name
FROM analysis_task t
LEFT JOIN squad s ON s.id = t.squad_id
WHERE t.room_id = $1
ORDER BY t.created_at DESC
LIMIT $2;

-- name: ListAnalysisArtifactsForRoom :many
-- Artifacts across every task in a room. Joining via analysis_task
-- keeps the room scoping correct without exposing analysis_task_id
-- in the URL surface (we only key the API by room id at P2). The
-- ARTIFACTS tab groups by type client-side.
SELECT a.* FROM analysis_artifact a
JOIN analysis_task t ON t.id = a.analysis_task_id
WHERE t.room_id = $1
ORDER BY a.created_at DESC
LIMIT $2;

-- name: ListAnalysisAuditEventsForRoom :many
-- Audit events across every task in a room. Same join pattern as
-- artifacts. AUDIT tab renders these as a unified timeline.
SELECT e.* FROM analysis_audit_event e
JOIN analysis_task t ON t.id = e.analysis_task_id
WHERE t.room_id = $1
ORDER BY e.created_at DESC
LIMIT $2;

-- name: GetAnalysisTask :one
SELECT * FROM analysis_task WHERE id = $1;

-- name: CreateAnalysisTask :one
-- Used by CreateChannel to seed the default task when a new room is
-- born. Also reachable from future "start new analysis" actions.
INSERT INTO analysis_task (
    workspace_id, room_id, issue_id, squad_id,
    business_question, current_stage, requires_approval,
    created_by_type, created_by_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: CreateAnalysisArtifact :one
INSERT INTO analysis_artifact (
    workspace_id, analysis_task_id, type, title, status, version,
    payload, file_refs, created_by_type, created_by_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: CreateAnalysisAuditEvent :one
-- Append-only. The application layer constructs the action key (e.g.
-- 'task.created') and stuffs whatever context it needs into details.
INSERT INTO analysis_audit_event (
    workspace_id, analysis_task_id, artifact_id,
    actor_type, actor_id, action, target_type, target_id,
    details, runtime_version
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: CountAnalysisTasksForRoom :one
SELECT COUNT(*)::int FROM analysis_task WHERE room_id = $1;

-- name: UpdateAnalysisTask :one
-- Partial update: only non-null args are applied. Used to bind a squad,
-- advance stage, set business_question, etc.
UPDATE analysis_task SET
    squad_id = COALESCE(sqlc.narg('squad_id'), squad_id),
    issue_id = COALESCE(sqlc.narg('issue_id'), issue_id),
    business_question = COALESCE(sqlc.narg('business_question'), business_question),
    current_stage = COALESCE(sqlc.narg('current_stage'), current_stage),
    requires_approval = COALESCE(sqlc.narg('requires_approval'), requires_approval),
    updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: GetDefaultAnalysisTaskForRoom :one
-- Returns the most-recently-created task for a room. Used by the
-- audit-event writer when it needs to attach an event to "the room's
-- current task" without the caller knowing the task id explicitly.
SELECT * FROM analysis_task
WHERE room_id = $1
ORDER BY created_at DESC
LIMIT 1;
