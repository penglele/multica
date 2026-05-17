"use client";

// W1 + P1: ARTIFACTS tab body. Fetches the real (currently empty) list
// so the swap to backed-by-DB data in P2 is a no-op for this component.

import { useQuery } from "@tanstack/react-query";
import { Package, Loader2 } from "lucide-react";
import { analysisArtifactsOptions } from "@multica/core/analysis";
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
    <div className="flex flex-1 flex-col p-4 text-xs text-muted-foreground">
      共 {artifacts.length} 个工件（P2 待实现卡片渲染）。
    </div>
  );
}
