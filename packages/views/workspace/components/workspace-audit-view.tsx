"use client";

// W1 + P2: AUDIT tab body. Reads /api/channels/<roomId>/analysis-audit-events
// from the real `analysis_audit_event` table. Renders a flat
// reverse-chronological list — the prettier per-task / per-actor
// timeline UI lands in W5.

import { useQuery } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { analysisAuditEventsOptions } from "@multica/core/analysis";
import { WorkspacePlaceholder } from "./workspace-placeholder";

interface WorkspaceAuditViewProps {
  roomId: string;
}

export function WorkspaceAuditView({ roomId }: WorkspaceAuditViewProps) {
  const { data: events = [], isLoading, error } = useQuery(
    analysisAuditEventsOptions(roomId),
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 size-3 animate-spin" />
        正在加载审计事件…
      </div>
    );
  }
  if (error) {
    return (
      <WorkspacePlaceholder
        icon={<History className="size-6 text-destructive" />}
        title="审计加载失败"
        description={error instanceof Error ? error.message : String(error)}
      />
    );
  }
  if (events.length === 0) {
    return (
      <WorkspacePlaceholder
        icon={<History className="size-6 text-muted-foreground" />}
        title="暂无审计记录"
        description="状态变更、Agent 调用、用户确认、BONCML 运行等动作会按时间顺序记录在这里。W5 阶段实现：结构化时间线、可回看、可导出。"
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <ol className="relative ml-2 border-l border-border">
        {events.map((e) => (
          <li key={e.id} className="relative pl-4 pb-3 last:pb-0">
            <span
              className={cn(
                "absolute -left-[5px] top-1.5 size-2 rounded-full ring-2 ring-background",
                actorDotClass(e.actor_type),
              )}
            />
            <div className="flex items-baseline gap-2 text-[11px]">
              <span className="rounded bg-muted px-1.5 py-px font-mono text-[10px]">
                {e.action}
              </span>
              <span className="text-muted-foreground">
                {new Date(e.created_at).toLocaleString()}
              </span>
              {e.runtime_version && (
                <span className="text-muted-foreground/70">runtime {e.runtime_version}</span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground">
              by {e.actor_type}
              {e.target_type && ` · ${e.target_type}`}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function actorDotClass(actor: string): string {
  switch (actor) {
    case "human":
      return "bg-brand";
    case "agent":
      return "bg-purple-500";
    case "system":
    default:
      return "bg-muted-foreground";
  }
}
