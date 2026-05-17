// BONCML Workspace P1 types. These describe the shape-stable contract
// the TASKS / ARTIFACTS / AUDIT views consume; the server returns empty
// arrays today. P2 fills the bodies with real fields per the
// productization plan section 6 (analysis_artifact / analysis_task /
// analysis_audit_event).

/**
 * Analysis Task — the BONCML semantic layer over `issue` (per plan
 * section 7). For P1 we only commit to the shape needed to render the
 * TASKS tab; concrete fields like `current_stage`, `dataset_artifact_id`
 * etc. land in P2 alongside the migration.
 */
export interface AnalysisTask {
  id: string;
  workspace_id: string;
  /** Issue id this analysis task extends. P2 wires the FK; null when
   *  the task hasn't been surfaced as an issue yet. */
  issue_id?: string;
  /** Channel/room id this task belongs to. */
  room_id: string;
  /** Squad providing the agent team config, when set. */
  squad_id?: string;
  current_stage: AnalysisStage;
  business_question: string;
  requires_approval: boolean;
  created_by_type: "human" | "agent" | "system";
  created_by_id?: string;
  created_at: string;
  updated_at: string;
}

export type AnalysisStage =
  | "created"
  | "clarifying"
  | "planning"
  | "data_ready"
  | "pending_approval"
  | "running"
  | "reviewing"
  | "completed"
  | "failed"
  | "archived";

/**
 * Analysis Artifact — the structured deliverable (Dataset Manifest /
 * Analysis Plan / BONCML Job Spec / Result Package / Audit Snapshot).
 * The discriminator is `type`; `payload` is the per-type body — its
 * exact shape depends on `type` and is documented per type rather than
 * encoded in TypeScript (it's JSONB on the server). Keep payload as
 * `unknown` here so consumers must cast/validate before using fields.
 */
export interface AnalysisArtifact {
  id: string;
  workspace_id: string;
  analysis_task_id: string;
  type: AnalysisArtifactType;
  title: string;
  status: string;
  version: number;
  payload: unknown;
  /** Attachment ids referenced by the payload, e.g. uploaded CSVs. */
  file_refs: unknown;
  created_by_type: "human" | "agent" | "system";
  created_by_id?: string;
  created_at: string;
  updated_at: string;
}

export type AnalysisArtifactType =
  | "dataset_manifest"
  | "analysis_plan"
  | "boncml_job_spec"
  | "result_package"
  | "audit_snapshot";

/**
 * Analysis Audit Event — single row in the AUDIT tab's timeline. Distinct
 * from `issue.activity` so BONCML semantics (Runtime version, Job Spec
 * params, artefact bindings) have a dedicated channel.
 */
export interface AnalysisAuditEvent {
  id: string;
  workspace_id: string;
  analysis_task_id?: string;
  artifact_id?: string;
  actor_type: "human" | "agent" | "system";
  actor_id?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  /** Free-form per-action context (see plan section 6.5). */
  details: unknown;
  runtime_version?: string;
  created_at: string;
}
