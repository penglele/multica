"use client";

// WorkspaceHomePage is what /[slug]/rooms resolves to — the BONCML
// Workspace's "front door" when no specific room is in the URL.
//
// Behavior:
//   - workspace has ≥1 rooms → redirect to the first room (its
//     /rooms/<id> URL), so the user lands directly on a usable workbench.
//     Loading-state: brief skeleton.
//   - workspace has 0 rooms → render an empty-state with a "create your
//     first analysis room" CTA. Reuses CreateChannelDialog: rooms == channels
//     under the hood today, so we share the create form, just relabelled.
//
// The redirect path is intentional: most users see /rooms only as a
// transient stop. The empty-state path is what new workspaces hit on
// first visit, and is exactly the moment we want to surface "this is
// where your analysis happens" rather than dropping them on a bare list.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { useNavigation } from "@multica/views/navigation";
import { paths } from "@multica/core/paths";
import { useWorkspaceId } from "@multica/core/hooks";
import { channelListOptions } from "@multica/core/channels";
import { CreateChannelDialog } from "../../channels/components/create-channel-dialog";

interface WorkspaceHomePageProps {
  workspaceSlug: string;
}

export function WorkspaceHomePage({ workspaceSlug }: WorkspaceHomePageProps) {
  const workspaceId = useWorkspaceId();
  const { data: rooms = [], isLoading } = useQuery(channelListOptions(workspaceId));
  const { push } = useNavigation();
  const [createOpen, setCreateOpen] = useState(false);

  const firstRoomId = rooms[0]?.id;

  useEffect(() => {
    // Auto-redirect to the first room ONCE rooms are loaded. The redirect
    // is intentionally one-shot and gated on `firstRoomId` so user-visible
    // loading flicker is short. Empty workspaces fall through to the
    // empty-state below.
    if (firstRoomId) {
      push(paths.workspace(workspaceSlug).workspaceRoom(firstRoomId));
    }
  }, [firstRoomId, workspaceSlug, push]);

  if (isLoading || firstRoomId) {
    // Short skeleton while we either load the room list or wait for the
    // navigation to fire. Avoid showing the empty-state in the gap
    // between mount and data arrival.
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        正在打开工作台…
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Plus className="size-7" />
          </div>
          <h1 className="mb-2 text-lg font-semibold">还没有分析房间</h1>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            分析房间是 BONCML Workspace 的协作单元。每个房间承载一个分析任务、一组 Agent、
            以及对应的工件和审计记录。创建第一个房间开始你的分析。
          </p>
          <Button onClick={() => setCreateOpen(true)} className="gap-1">
            <Plus className="size-4" />
            创建第一个分析房间
          </Button>
        </div>
      </div>

      <CreateChannelDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => push(paths.workspace(workspaceSlug).workspaceRoom(id))}
      />
    </>
  );
}
