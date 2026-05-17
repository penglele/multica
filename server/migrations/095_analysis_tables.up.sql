-- BONCML Workspace P2: minimal model for analysis tasks, structured
-- artifacts, and audit events. These tables sit ON TOP of multica's
-- existing primitives (issue, channel, squad) — they don't replace
-- them. Per the productization plan section 7:
--   - issue stays as the underlying generic work item; analysis_task
--     points at it via issue_id (nullable, since not every analysis
--     surfaces an issue immediately).
--   - squad stays as the Agent Team config source; analysis_task
--     points at it via squad_id (nullable).
--   - room == channel today; analysis_task.room_id is the channel id.

-- analysis_task: BONCML semantic layer over a piece of analysis work.
-- One room can have many tasks over time; one task tracks one analysis
-- run-through (one business question, one method choice, one result).
CREATE TABLE analysis_task (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    -- Generic work item. Nullable so a task can exist before an issue
    -- is filed and so deleting an issue doesn't cascade away the
    -- analysis history (the audit trail is the system of record).
    issue_id UUID REFERENCES issue(id) ON DELETE SET NULL,
    -- Room (channel) the analysis is conducted in. CASCADE — a deleted
    -- room takes its task with it; chat history is gone anyway.
    room_id UUID NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    -- Agent Team config. Nullable — an analysis can run with ad-hoc
    -- agents (channel members) without a formal squad.
    squad_id UUID REFERENCES squad(id) ON DELETE SET NULL,
    -- The user-facing question this task tracks. Plain text, not
    -- structured — that's what Analysis Plan artifacts are for.
    business_question TEXT NOT NULL DEFAULT '',
    -- BONCML stage machine; see plan section 7.2 for the full sequence.
    -- The CHECK keeps the column honest until we add a state-transition
    -- helper; the issue.status mapping lives in the resolver, not in
    -- the database, so we don't constrain transitions here.
    current_stage TEXT NOT NULL DEFAULT 'created' CHECK (current_stage IN (
        'created',
        'clarifying',
        'planning',
        'data_ready',
        'pending_approval',
        'running',
        'reviewing',
        'completed',
        'failed',
        'archived'
    )),
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    -- Actor who created the task. UUID (no FK) so it can reference
    -- "user" or "agent" by id without a polymorphic mess; the
    -- resolver looks up by created_by_type.
    created_by_type TEXT NOT NULL DEFAULT 'system' CHECK (created_by_type IN ('human', 'agent', 'system')),
    created_by_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_task_room ON analysis_task(room_id, created_at DESC);
CREATE INDEX idx_analysis_task_workspace ON analysis_task(workspace_id, current_stage);
CREATE INDEX idx_analysis_task_issue ON analysis_task(issue_id) WHERE issue_id IS NOT NULL;

-- analysis_artifact: structured deliverables. The discriminator is
-- `type`; the per-type payload lives in the JSONB blob so we don't
-- have to migrate the schema every time a new type's fields evolve.
-- Payload validation (per type) lives in the application layer (P4
-- Runtime work tightens those schemas).
CREATE TABLE analysis_artifact (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    analysis_task_id UUID NOT NULL REFERENCES analysis_task(id) ON DELETE CASCADE,
    -- Five canonical types per plan section 6. Anything outside this
    -- set should not be writable; we'd rather a CHECK violation than
    -- a "what is this artifact" surprise three months from now.
    type TEXT NOT NULL CHECK (type IN (
        'dataset_manifest',
        'analysis_plan',
        'boncml_job_spec',
        'result_package',
        'audit_snapshot'
    )),
    title TEXT NOT NULL,
    -- Status is per-type: a Dataset Manifest is "draft" or "approved";
    -- a Job Spec is "queued" or "completed" or "failed". We treat it
    -- as free text and let the UI lean on the type for vocabulary.
    status TEXT NOT NULL DEFAULT 'draft',
    -- Monotonic per (analysis_task_id, type). When we re-plan an
    -- analysis we bump version rather than mutate in place — that's
    -- what makes the audit trail meaningful.
    version INT NOT NULL DEFAULT 1,
    payload JSONB NOT NULL DEFAULT '{}',
    -- attachment ids referenced by the payload (CSVs, exports, etc.).
    -- Stored as a JSON array of UUID strings; we don't FK because
    -- attachment lifecycle is independent (an attachment can be
    -- referenced by chat AND artifact).
    file_refs JSONB NOT NULL DEFAULT '[]',
    created_by_type TEXT NOT NULL DEFAULT 'agent' CHECK (created_by_type IN ('human', 'agent', 'system')),
    created_by_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_artifact_task ON analysis_artifact(analysis_task_id, created_at DESC);
CREATE INDEX idx_analysis_artifact_type ON analysis_artifact(analysis_task_id, type, version DESC);

-- analysis_audit_event: append-only timeline of state changes, agent
-- calls, user confirmations, runtime invocations. Kept distinct from
-- issue.activity so BONCML semantics (Job Spec parameters, Runtime
-- version, artifact bindings) have a dedicated channel that's safe
-- to query without parsing free-form activity rows.
CREATE TABLE analysis_audit_event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    analysis_task_id UUID REFERENCES analysis_task(id) ON DELETE CASCADE,
    artifact_id UUID REFERENCES analysis_artifact(id) ON DELETE SET NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'agent', 'system')),
    actor_id UUID,
    -- Free-form action key. Examples: 'task.created', 'task.stage_changed',
    -- 'artifact.created', 'artifact.approved', 'job.requested', 'job.failed'.
    -- We deliberately don't constrain these so app code can introduce
    -- new event types without a migration.
    action TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    details JSONB NOT NULL DEFAULT '{}',
    -- Only set for runtime-triggered events (P4 onwards). Stored as
    -- text so we can pin events to a specific BONCML release.
    runtime_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_analysis_audit_task ON analysis_audit_event(analysis_task_id, created_at DESC);
CREATE INDEX idx_analysis_audit_workspace ON analysis_audit_event(workspace_id, created_at DESC);

-- Backfill: every existing channel becomes a room with one default
-- analysis_task in the 'created' stage. New rooms get the same
-- treatment from the CreateChannel handler going forward. This keeps
-- the TASKS tab from greeting users with "no tasks" the moment they
-- open a pre-existing channel.
INSERT INTO analysis_task (workspace_id, room_id, business_question, current_stage, created_by_type)
SELECT workspace_id, id, '', 'created', 'system'
FROM channel
WHERE NOT EXISTS (
    SELECT 1 FROM analysis_task t WHERE t.room_id = channel.id
);

-- Seed a creation audit event for each backfilled task so the AUDIT
-- tab has at least one row to render against, instead of looking
-- broken right after migration runs. Going forward, audit events are
-- written by application code — this is one-time data hygiene.
INSERT INTO analysis_audit_event (workspace_id, analysis_task_id, actor_type, action, details)
SELECT workspace_id, id, 'system', 'task.created',
       jsonb_build_object('source', 'p2_backfill', 'reason', 'Auto-created on migration to BONCML Workspace P2 schema')
FROM analysis_task
WHERE created_by_type = 'system' AND business_question = '';
