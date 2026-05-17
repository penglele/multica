"use client";

// W1 + P1: TASKS tab body. Fetches /api/channels/<roomId>/analysis-tasks
// which currently returns []; the view renders the empty state until P2
// lands the real data model. By going through the real hook today we
// validate the shape-stable contract end-to-end and keep the swap to
// real data a one-spot change.

import { useQuery } from "@tanstack/react-query";
import { ListChecks, Loader2 } from "lucide-react";
import { analysisTasksOptions } from "@multica/core/analysis";
import { WorkspacePlaceholder } from "./workspace-placeholder";

interface WorkspaceTaskViewProps {
  roomId: string;
}

export function WorkspaceTaskView({ roomId }: WorkspaceTaskViewProps) {
  const { data: tasks = [], isLoading, error } = useQuery(analysisTasksOptions(roomId));

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 size-3 animate-spin" />
        正在加载任务…
      </div>
    );
  }
  if (error) {
    return (
      <WorkspacePlaceholder
        icon={<ListChecks className="size-6 text-destructive" />}
        title="任务加载失败"
        description={error instanceof Error ? error.message : String(error)}
      />
    );
  }
  if (tasks.length === 0) {
    return (
      <WorkspacePlaceholder
        icon={<ListChecks className="size-6 text-muted-foreground" />}
        title="暂无分析任务"
        description="当 Orchestrator 接收到分析需求并拆分阶段时，任务会出现在这里。W3 阶段实现：阶段卡、责任 Agent、等待确认项、当前运行步骤。"
      />
    );
  }

  // Real list rendering lands in W3.
  return (
    <div className="flex flex-1 flex-col p-4 text-xs text-muted-foreground">
      共 {tasks.length} 个任务（P2 待实现列表渲染）。
    </div>
  );
}
