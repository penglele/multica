"use client";

// W1 + P2: TASKS tab body. Reads /api/channels/<roomId>/analysis-tasks
// from the real `analysis_task` table. Renders a stage badge, business
// question, and timestamp per task. The richer per-stage card UI
// (responsible Agent, pending-confirm gates, currently-running step)
// lands in W3.

import { useQuery } from "@tanstack/react-query";
import { ListChecks, Loader2 } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import {
  analysisTasksOptions,
  type AnalysisStage,
} from "@multica/core/analysis";
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

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {tasks.map((t) => (
        <div
          key={t.id}
          className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
        >
          <div className="flex items-center gap-2">
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", stageBadgeClass(t.current_stage))}>
              {stageLabel(t.current_stage)}
            </span>
            {t.squad_name && (
              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-900 dark:bg-purple-950 dark:text-purple-200">
                🤖 {t.squad_name}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {new Date(t.created_at).toLocaleString()}
            </span>
            {t.requires_approval && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                需审批
              </span>
            )}
          </div>
          <div className="mt-1 text-foreground">
            {t.business_question || (
              <span className="text-muted-foreground">（未填写业务问题）</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function stageLabel(s: AnalysisStage): string {
  switch (s) {
    case "created":           return "已创建";
    case "clarifying":        return "澄清中";
    case "planning":          return "规划中";
    case "data_ready":        return "数据就绪";
    case "pending_approval":  return "待审批";
    case "running":           return "执行中";
    case "reviewing":         return "复核中";
    case "completed":         return "已完成";
    case "failed":            return "失败";
    case "archived":          return "已归档";
    default:                  return s;
  }
}

function stageBadgeClass(s: AnalysisStage): string {
  switch (s) {
    case "running":
      return "bg-brand/10 text-brand";
    case "pending_approval":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "completed":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
    case "failed":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-muted text-muted-foreground";
  }
}
