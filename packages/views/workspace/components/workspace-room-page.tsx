"use client";

// WorkspaceRoomPage is the new top-level page for a single BONCML
// Workspace room. Per the W1 plan it replaces the role of
// ChannelDetailPage as "the page users land on" — but ChannelDetailPage
// stays alive at /channels/:id so existing links keep working.
//
// Composition:
//   WorkspaceShell
//     ├─ WorkspaceLeftRail (Workspace / Rooms / Members / Agents / System)
//     ├─ WorkspaceHeader   (room title + analysis breadcrumb)
//     └─ WorkspaceTabs     (CHAT | TASKS | ARTIFACTS | AUDIT)
//        └─ active tab content
//             - CHAT       → ChannelConversation (real, shipped)
//             - TASKS      → WorkspaceTaskView    (W3 placeholder)
//             - ARTIFACTS  → WorkspaceArtifactView (W4 placeholder)
//             - AUDIT      → WorkspaceAuditView   (W5 placeholder)

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings, Users } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { useWorkspaceId } from "@multica/core/hooks";
import {
  channelDetailOptions,
  channelMembersOptions,
  useUpdateChannel,
} from "@multica/core/channels";
import { ChannelConversation, ChannelMembersDialog } from "../../channels";
import { WorkspaceShell } from "./workspace-shell";
import { WorkspaceLeftRail } from "./workspace-left-rail";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceTabs, type WorkspaceTab } from "./workspace-tabs";
import { WorkspaceTaskView } from "./workspace-task-view";
import { WorkspaceArtifactView } from "./workspace-artifact-view";
import { WorkspaceAuditView } from "./workspace-audit-view";

interface WorkspaceRoomPageProps {
  workspaceSlug: string;
  roomId: string;
}

export function WorkspaceRoomPage({ workspaceSlug, roomId }: WorkspaceRoomPageProps) {
  const workspaceId = useWorkspaceId();
  const [tab, setTab] = useState<WorkspaceTab>("chat");
  const [membersOpen, setMembersOpen] = useState(false);

  const { data: room } = useQuery(channelDetailOptions(workspaceId, roomId));
  const { data: members = [] } = useQuery(channelMembersOptions(roomId));
  const updateChannel = useUpdateChannel();

  if (!room) {
    // Loading / not-found is handled at the route layer; render a thin
    // pass-through here so the shell still mounts and we don't flash an
    // empty page.
    return null;
  }

  return (
    <>
      <WorkspaceShell
        leftRail={
          <WorkspaceLeftRail
            workspaceSlug={workspaceSlug}
            workspaceId={workspaceId}
            activeRoomId={roomId}
          />
        }
        header={
          <WorkspaceHeader
            roomName={room.name}
            roomType={room.type}
            subtitle={room.description || undefined}
            // W1: hard-coded to data_quality. W3+ should derive this from
            // task state once the state machine lands.
            activeStep="data_quality"
            actions={
              <>
                <button
                  onClick={() => setMembersOpen(true)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="成员"
                >
                  <Users className="size-3.5" />
                  <span>{members.length}</span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => updateChannel.mutate({ id: room.id, auto_reply: !room.auto_reply })}
                  title={room.auto_reply ? "关闭自动接话" : "开启自动接话"}
                >
                  <Settings className="size-3.5" />
                  {room.auto_reply ? "自动接话" : "手动"}
                </Button>
              </>
            }
          />
        }
      >
        <WorkspaceTabs value={tab} onValueChange={setTab} />
        {/* Render every tab once and toggle visibility via CSS so children
         *  preserve their state when switching tabs (e.g. the chat
         *  composer's draft, scroll position). Mount-cost is one-time per
         *  tab; we do not mount/unmount on each click. */}
        <div className="flex flex-1 min-h-0 flex-col">
          <TabPane active={tab === "chat"}>
            <ChannelConversation key={roomId} channelId={roomId} density="comfortable" />
          </TabPane>
          <TabPane active={tab === "tasks"}>
            <WorkspaceTaskView />
          </TabPane>
          <TabPane active={tab === "artifacts"}>
            <WorkspaceArtifactView />
          </TabPane>
          <TabPane active={tab === "audit"}>
            <WorkspaceAuditView />
          </TabPane>
        </div>
      </WorkspaceShell>

      <ChannelMembersDialog
        channelId={roomId}
        open={membersOpen}
        onOpenChange={setMembersOpen}
      />
    </>
  );
}

/**
 * Always-mounted tab pane that toggles via `hidden`. All four tabs stay
 * in the DOM so switching back to CHAT preserves ChannelConversation's
 * scroll position, optimistic placeholders, and the auto-mark-read
 * cursor; switching back to TASKS keeps any local task-view state.
 * Placeholder panes (TASKS / ARTIFACTS / AUDIT) are ~30 lines today, so
 * mounting all four is essentially free.
 */
function TabPane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-1 min-h-0 flex-col"
      hidden={!active}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}
