"use client";

// W1 placeholder. The real TASKS view (per-stage cards, responsible agent,
// pending-confirm nodes, currently running step) lands in W3 once the
// task state machine is wired up.

import { ListChecks } from "lucide-react";
import { WorkspacePlaceholder } from "./workspace-placeholder";

export function WorkspaceTaskView() {
  return (
    <WorkspacePlaceholder
      icon={<ListChecks className="size-6 text-muted-foreground" />}
      title="任务视图"
      description="W3 阶段实现：当前任务总状态、阶段卡、责任 Agent、等待用户确认项、当前运行中的步骤。"
    />
  );
}
