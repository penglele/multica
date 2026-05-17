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
  /** Issue id this analysis task extends. P2 wires the FK; P1 returns []. */
  issue_id: string;
  /** Channel/room id this task belongs to. */
  room_id: string;
  current_stage: AnalysisStage;
  business_question?: string;
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
 * The discriminator is `type`; payload shape depends on type and lands
 * in P2.
 */
export interface AnalysisArtifact {
  id: string;
  workspace_id: string;
  analysis_task_id: string;
  type: AnalysisArtifactType;
  title: string;
  status: string;
  version: number;
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
  runtime_version?: string;
  created_at: string;
}
