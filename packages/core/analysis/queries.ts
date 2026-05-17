import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AnalysisTask,
  AnalysisArtifact,
  AnalysisAuditEvent,
} from "./types";

// Cache keys, namespaced under "analysis-*" so they survive the
// channel-* invalidations C2 wires up. P2 will add invalidation hooks
// when the real data lands.
export const analysisKeys = {
  tasks: (roomId: string) => ["analysis-tasks", roomId] as const,
  artifacts: (roomId: string) => ["analysis-artifacts", roomId] as const,
  auditEvents: (roomId: string) => ["analysis-audit-events", roomId] as const,
};

export function analysisTasksOptions(roomId: string) {
  return queryOptions({
    queryKey: analysisKeys.tasks(roomId),
    queryFn: () => api.listAnalysisTasks(roomId),
    enabled: !!roomId,
    // P1 stub returns []; once the real backend lands we want frequent
    // refresh during a running task. Setting staleTime: 0 means refetch
    // on every mount, which is fine for cheap empty responses today.
    staleTime: 0,
  });
}

export function analysisArtifactsOptions(roomId: string) {
  return queryOptions({
    queryKey: analysisKeys.artifacts(roomId),
    queryFn: () => api.listAnalysisArtifacts(roomId),
    enabled: !!roomId,
    staleTime: 0,
  });
}

export function analysisAuditEventsOptions(roomId: string) {
  return queryOptions({
    queryKey: analysisKeys.auditEvents(roomId),
    queryFn: () => api.listAnalysisAuditEvents(roomId),
    enabled: !!roomId,
    staleTime: 0,
  });
}

// Re-exports for convenience.
export type { AnalysisTask, AnalysisArtifact, AnalysisAuditEvent };
