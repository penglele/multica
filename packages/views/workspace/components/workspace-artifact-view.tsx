"use client";

// W1 placeholder. The real ARTIFACTS view (Dataset Manifest / Analysis
// Plan / BONCML Job Spec / Result Package cards with detail/download/
// version) lands in W4 once the artifact backend protocol is in place.

import { Package } from "lucide-react";
import { WorkspacePlaceholder } from "./workspace-placeholder";

export function WorkspaceArtifactView() {
  return (
    <WorkspacePlaceholder
      icon={<Package className="size-6 text-muted-foreground" />}
      title="工件视图"
      description="W4 阶段实现：数据集 / Analysis Plan / BONCML Job Spec / Result Package 卡片，可打开详情、下载、查看版本。"
    />
  );
}
