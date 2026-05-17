"use client";

// W1 + P1: AUDIT tab body. Fetches the real (currently empty) audit
// event stream so the timeline swap in P2 is a one-spot change.

import { useQuery } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
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
    <div className="flex flex-1 flex-col p-4 text-xs text-muted-foreground">
      共 {events.length} 条审计事件（P2 待实现时间线渲染）。
    </div>
  );
}
