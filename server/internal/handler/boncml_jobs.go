package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/exec"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// ---------------------------------------------------------------------------
// POST /api/channels/:channelId/analysis-tasks/:taskId/boncml-jobs
//
// Creates a boncml_job_spec artifact on the given analysis_task, then
// enqueues a Runner agent task (via agent_task_queue) that carries the
// analysis_task_id explicitly. The Runner daemon reads the Job Spec
// artifact, executes the algorithm (P5), and writes back a
// result_package artifact + audit events.
//
// P4 scope: the endpoint creates the Job Spec + enqueues the task +
// writes the full audit chain. The Runner daemon in P4 produces a
// minimal mock result_package on completion (real BONCML execution is
// P5). The protocol shape is final — P5 only changes what the daemon
// does internally, not the API contract.
// ---------------------------------------------------------------------------

type createBoncmlJobRequest struct {
	Algorithm    string         `json:"algorithm"`
	DatasetID    string         `json:"dataset_id"`
	FieldMapping map[string]any `json:"field_mapping"`
	Parameters   map[string]any `json:"parameters"`
	OutputFormat []string       `json:"output_formats"`
	// RunnerAgentID: which agent should execute. Required so the caller
	// explicitly picks the Runner rather than relying on auto-reply.
	RunnerAgentID string `json:"runner_agent_id"`
}

func (h *Handler) CreateBoncmlJob(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	wsID := ctxWorkspaceID(r.Context())
	wsUUID, ok := parseUUIDOrBadRequest(w, wsID, "workspace_id")
	if !ok {
		return
	}
	channelID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "channelId"), "channelId")
	if !ok {
		return
	}
	taskID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "taskId"), "taskId")
	if !ok {
		return
	}

	var req createBoncmlJobRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Algorithm == "" {
		writeError(w, http.StatusBadRequest, "algorithm is required")
		return
	}
	if req.RunnerAgentID == "" {
		writeError(w, http.StatusBadRequest, "runner_agent_id is required")
		return
	}

	// Validate: analysis_task exists and belongs to this channel+workspace.
	task, err := h.Queries.GetAnalysisTask(r.Context(), taskID)
	if err != nil || task.RoomID != channelID || task.WorkspaceID != wsUUID {
		writeError(w, http.StatusNotFound, "analysis task not found in this room")
		return
	}

	// Validate: runner agent exists and has a runtime.
	runnerUUID, ok := parseUUIDOrBadRequest(w, req.RunnerAgentID, "runner_agent_id")
	if !ok {
		return
	}
	runner, err := h.Queries.GetAgent(r.Context(), runnerUUID)
	if err != nil || !runner.RuntimeID.Valid {
		writeError(w, http.StatusBadRequest, "runner agent not found or has no runtime")
		return
	}

	// 1. Create boncml_job_spec artifact.
	payload, _ := json.Marshal(map[string]any{
		"algorithm":      req.Algorithm,
		"dataset_id":     req.DatasetID,
		"field_mapping":  req.FieldMapping,
		"parameters":     req.Parameters,
		"output_formats": req.OutputFormat,
		"runtime_version": "", // filled by daemon on execution (P5)
	})
	fileRefs, _ := json.Marshal([]string{})

	jobSpec, err := h.Queries.CreateAnalysisArtifact(r.Context(), db.CreateAnalysisArtifactParams{
		WorkspaceID:    wsUUID,
		AnalysisTaskID: taskID,
		Type:           "boncml_job_spec",
		Title:          req.Algorithm,
		Status:         "queued",
		Version:        1,
		Payload:        payload,
		FileRefs:       fileRefs,
		CreatedByType:  "human",
		CreatedByID:    pgtype.UUID{Bytes: parseUUID(userID).Bytes, Valid: true},
	})
	if err != nil {
		slog.Error("CreateBoncmlJob: failed to create job_spec artifact", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create job spec")
		return
	}

	// 2. Audit: job.requested
	h.writeAnalysisAudit(r.Context(), wsUUID, taskID, jobSpec.ID, "human", userID, "job.requested", map[string]any{
		"algorithm":       req.Algorithm,
		"runner_agent_id": req.RunnerAgentID,
	})

	// 3. Enqueue Runner agent task with explicit analysis_task_id.
	agentTask, err := h.Queries.CreateChannelTask(r.Context(), db.CreateChannelTaskParams{
		AgentID:        runnerUUID,
		RuntimeID:      runner.RuntimeID,
		Priority:       1, // high priority for explicit jobs
		ChannelID:      channelID,
		ChannelMessageID: pgtype.UUID{}, // no specific message
		AnalysisTaskID: pgtype.UUID{Bytes: taskID.Bytes, Valid: true},
	})
	if err != nil {
		slog.Error("CreateBoncmlJob: failed to enqueue runner task", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to enqueue runner task")
		return
	}

	// 4. Audit: job.queued
	h.writeAnalysisAudit(r.Context(), wsUUID, taskID, jobSpec.ID, "system", "", "job.queued", map[string]any{
		"agent_task_queue_id": uuidToString(agentTask.ID),
		"runner_agent_id":     req.RunnerAgentID,
	})

	// 5. Notify daemon.
	h.TaskService.NotifyTaskEnqueued(r.Context(), agentTask)

	// 6. Advance analysis_task stage to 'running'.
	_, _ = h.Queries.UpdateAnalysisTask(r.Context(), db.UpdateAnalysisTaskParams{
		ID:           taskID,
		CurrentStage: pgtype.Text{String: "running", Valid: true},
	})

	// 7. P5: Execute the analysis synchronously via boncml-stat-tools
	// subprocess. This is the MVP path — the server calls the Python
	// bridge directly rather than waiting for the agent daemon to do it.
	// The protocol shape (artifact + audit writes) is identical to what
	// the daemon path would produce; P6+ can move execution to the daemon
	// side once agent instructions are tuned.
	go h.executeBoncmlJob(task, jobSpec, req)

	writeJSON(w, http.StatusCreated, map[string]any{
		"job_spec_artifact_id": uuidToString(jobSpec.ID),
		"agent_task_id":        uuidToString(agentTask.ID),
		"analysis_task_id":     uuidToString(taskID),
		"status":               "queued",
	})
}

// writeAnalysisAudit is a convenience for writing analysis_audit_event
// rows with consistent shape. actorID can be "" for system events.
func (h *Handler) writeAnalysisAudit(
	ctx context.Context,
	wsID, taskID, artifactID pgtype.UUID,
	actorType, actorID, action string,
	detailsMap map[string]any,
) {
	details, _ := json.Marshal(detailsMap)
	var actorUUID pgtype.UUID
	if actorID != "" {
		actorUUID = pgtype.UUID{Bytes: parseUUID(actorID).Bytes, Valid: true}
	}
	_, _ = h.Queries.CreateAnalysisAuditEvent(ctx, db.CreateAnalysisAuditEventParams{
		WorkspaceID:    wsID,
		AnalysisTaskID: pgtype.UUID{Bytes: taskID.Bytes, Valid: true},
		ArtifactID:     pgtype.UUID{Bytes: artifactID.Bytes, Valid: artifactID.Valid},
		ActorType:      actorType,
		ActorID:        actorUUID,
		Action:         action,
		TargetType:     pgtype.Text{},
		TargetID:       pgtype.UUID{},
		Details:        details,
		RuntimeVersion: pgtype.Text{},
	})
}

// executeBoncmlJob runs boncml-stat-tools execute_analysis via subprocess
// and writes the result as a result_package artifact + audit events.
// Runs in a goroutine off the request path.
func (h *Handler) executeBoncmlJob(task db.AnalysisTask, jobSpec db.AnalysisArtifact, req createBoncmlJobRequest) {
	ctx := context.Background()

	// Audit: job.running
	h.writeAnalysisAudit(ctx, task.WorkspaceID, task.ID, jobSpec.ID, "system", "", "job.running", map[string]any{
		"algorithm": req.Algorithm,
	})

	// Build params for execute_analysis
	params := map[string]any{
		"data_path": req.DatasetID, // In P5 MVP, dataset_id IS the file path
		"mode":      "one_sample",  // Default; real dispatch reads from job spec
	}
	// Merge field_mapping into params
	if req.FieldMapping != nil {
		for k, v := range req.FieldMapping {
			params[k] = v
		}
	}
	// Merge parameters into params
	if req.Parameters != nil {
		for k, v := range req.Parameters {
			params[k] = v
		}
	}

	paramsJSON, _ := json.Marshal(params)

	// Resolve python path and runtime root from environment
	pythonPath := os.Getenv("BONCML_PYTHON_PATH")
	if pythonPath == "" {
		pythonPath = "python3"
	}
	boncmlRoot := os.Getenv("BONCML_STAT_TOOLS_ROOT")
	if boncmlRoot == "" {
		boncmlRoot = "/Users/penglei/Desktop/JApplication/work_space/git_clone/boncml-stat-tools"
	}
	runtimeRoot := boncmlRoot + "/vendored"
	bridgeScript := boncmlRoot + "/boncml/bridge_runner.py"

	// Execute
	cmd := exec.CommandContext(ctx, pythonPath, bridgeScript, req.Algorithm, string(paramsJSON), runtimeRoot)
	cmd.Dir = boncmlRoot
	output, err := cmd.Output()

	if err != nil {
		// Job failed
		errMsg := err.Error()
		if exitErr, ok := err.(*exec.ExitError); ok {
			errMsg = string(exitErr.Stderr)
		}
		slog.Error("boncml execution failed", "algorithm", req.Algorithm, "error", errMsg)
		h.writeAnalysisAudit(ctx, task.WorkspaceID, task.ID, jobSpec.ID, "system", "", "job.failed", map[string]any{
			"algorithm": req.Algorithm,
			"error":     errMsg[:min(len(errMsg), 500)],
		})
		_, _ = h.Queries.UpdateAnalysisTask(ctx, db.UpdateAnalysisTaskParams{
			ID:           task.ID,
			CurrentStage: pgtype.Text{String: "failed", Valid: true},
		})
		return
	}

	// Parse result
	var result map[string]any
	if err := json.Unmarshal(output, &result); err != nil {
		slog.Error("boncml result parse failed", "error", err)
		h.writeAnalysisAudit(ctx, task.WorkspaceID, task.ID, jobSpec.ID, "system", "", "job.failed", map[string]any{
			"algorithm": req.Algorithm,
			"error":     "invalid JSON from bridge_runner",
		})
		_, _ = h.Queries.UpdateAnalysisTask(ctx, db.UpdateAnalysisTaskParams{
			ID:           task.ID,
			CurrentStage: pgtype.Text{String: "failed", Valid: true},
		})
		return
	}

	// Check for bridge-level error
	if errField, ok := result["__error__"]; ok {
		slog.Error("boncml algorithm error", "error", errField)
		h.writeAnalysisAudit(ctx, task.WorkspaceID, task.ID, jobSpec.ID, "system", "", "job.failed", map[string]any{
			"algorithm": req.Algorithm,
			"error":     errField,
		})
		_, _ = h.Queries.UpdateAnalysisTask(ctx, db.UpdateAnalysisTaskParams{
			ID:           task.ID,
			CurrentStage: pgtype.Text{String: "failed", Valid: true},
		})
		return
	}

	// Success: write result_package artifact
	payload, _ := json.Marshal(result)
	fileRefs, _ := json.Marshal([]string{})

	artifact, artErr := h.Queries.CreateAnalysisArtifact(ctx, db.CreateAnalysisArtifactParams{
		WorkspaceID:    task.WorkspaceID,
		AnalysisTaskID: task.ID,
		Type:           "result_package",
		Title:          "Result: " + req.Algorithm,
		Status:         "completed",
		Version:        1,
		Payload:        payload,
		FileRefs:       fileRefs,
		CreatedByType:  "system",
		CreatedByID:    pgtype.UUID{},
	})
	if artErr != nil {
		slog.Error("failed to create result_package artifact", "error", artErr)
		return
	}

	// Audit: artifact.created
	h.writeAnalysisAudit(ctx, task.WorkspaceID, task.ID, artifact.ID, "system", "", "artifact.created", map[string]any{
		"artifact_type": "result_package",
		"algorithm":     req.Algorithm,
	})

	// Audit: job.completed
	h.writeAnalysisAudit(ctx, task.WorkspaceID, task.ID, jobSpec.ID, "system", "", "job.completed", map[string]any{
		"algorithm":    req.Algorithm,
		"result_artifact_id": uuidToString(artifact.ID),
	})

	// Advance task stage
	_, _ = h.Queries.UpdateAnalysisTask(ctx, db.UpdateAnalysisTaskParams{
		ID:           task.ID,
		CurrentStage: pgtype.Text{String: "completed", Valid: true},
	})
}
