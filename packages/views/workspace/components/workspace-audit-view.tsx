"use client";

// W1 placeholder. The real AUDIT view (timeline of state changes, Agent
// invocations, user confirmations, BONCML runs) lands in W5 once the
// audit_event store is wired up.

import { History } from "lucide-react";
import { WorkspacePlaceholder } from "./workspace-placeholder";

export function WorkspaceAuditView() {
  return (
    <WorkspacePlaceholder
      icon={<History className="size-6 text-muted-foreground" />}
      title="审计视图"
      description="W5 阶段实现：状态变更、Agent 调用、用户确认、BONCML 运行的结构化时间线。"
    />
  );
}
