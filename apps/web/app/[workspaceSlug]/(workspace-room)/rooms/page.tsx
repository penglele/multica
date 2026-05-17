"use client";

import { use } from "react";
import { WorkspaceHomePage } from "@multica/views/workspace/components";

export default function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = use(params);
  return <WorkspaceHomePage workspaceSlug={workspaceSlug} />;
}
