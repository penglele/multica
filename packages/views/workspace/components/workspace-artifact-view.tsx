"use client";

// W1 + P2: ARTIFACTS tab body. Reads /api/channels/<roomId>/analysis-artifacts
// from the real `analysis_artifact` table and renders a per-type card
// list. The fuller card UI (open-detail, download, version drilldown)
// lands in W4.

import { useQuery } from "@tanstack/react-query";
import { Database, FileText, Settings, Package, ScrollText, Loader2 } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import {
  analysisArtifactsOptions,
  type AnalysisArtifactType,
} from "@multica/core/analysis";
import { WorkspacePlaceholder } from "./workspace-placeholder";

interface WorkspaceArtifactViewProps {
  roomId: string;
}

export function WorkspaceArtifactView({ roomId }: WorkspaceArtifactViewProps) {
  const { data: artifacts = [], isLoading, error } = useQuery(
    analysisArtifactsOptions(roomId),
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 size-3 animate-spin" />
        正在加载工件…
      </div>
    );
  }
  if (error) {
    return (
      <WorkspacePlaceholder
        icon={<Package className="size-6 text-destructive" />}
        title="工件加载失败"
        description={error instanceof Error ? error.message : String(error)}
      />
    );
  }
  if (artifacts.length === 0) {
    return (
      <WorkspacePlaceholder
        icon={<Package className="size-6 text-muted-foreground" />}
        title="暂无工件"
        description="数据集 / Analysis Plan / BONCML Job Spec / Result Package 等结构化产出会出现在这里。W4 阶段实现：卡片视图、详情、版本、下载。"
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {artifacts.map((a) => {
        const meta = artifactTypeMeta(a.type);
        const Icon = meta.icon;
        return (
          <div
            key={a.id}
            className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
          >
            <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", meta.iconBg)}>
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {meta.label}
                </span>
                <span className="text-[10px] text-muted-foreground/70">v{a.version}</span>
                <span className="text-[10px] text-muted-foreground/70">{a.status}</span>
              </div>
              <div className="mt-0.5 truncate text-sm text-foreground">{a.title}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {new Date(a.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function artifactTypeMeta(t: AnalysisArtifactType) {
  switch (t) {
    case "dataset_manifest":
      return { label: "数据清单", icon: Database, iconBg: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200" };
    case "analysis_plan":
      return { label: "分析计划", icon: FileText, iconBg: "bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200" };
    case "boncml_job_spec":
      return { label: "Job Spec", icon: Settings, iconBg: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" };
    case "result_package":
      return { label: "结果包", icon: Package, iconBg: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" };
    case "audit_snapshot":
      return { label: "审计快照", icon: ScrollText, iconBg: "bg-muted text-muted-foreground" };
    default:
      return { label: String(t), icon: Package, iconBg: "bg-muted text-muted-foreground" };
  }
}
