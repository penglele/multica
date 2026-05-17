"use client";

import { use } from "react";
import { WorkspaceRoomPage } from "@multica/views/workspace/components";

export default function Page({
  params,
}: {
  params: Promise<{ workspaceSlug: string; roomId: string }>;
}) {
  const { workspaceSlug, roomId } = use(params);
  return <WorkspaceRoomPage workspaceSlug={workspaceSlug} roomId={roomId} />;
}
