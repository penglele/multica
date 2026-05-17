"use client";

// WorkspaceLeftRail is the BONCML Workspace's left column. Distinct from
// the global app sidebar (which keeps the dashboard nav: issues, projects,
// agents, settings, …). This rail is room-scoped and only appears inside
// WorkspaceRoomPage.
//
// Sections, in order:
//   1. Brand + workspace name
//   2. Rooms (== channels for now)
//   3. Members of the active room
//   4. Agents of the active room
//   5. System status (placeholder; real data lands when we wire telemetry)
//
// Per the plan section 6.3, this is a "Workspace Rail", not a generic
// sidebar — so the styling deliberately diverges from app-sidebar.

import { useQuery } from "@tanstack/react-query";
import { Hash, Lock, Search, Users, Bot, Activity } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { AppLink } from "@multica/views/navigation";
import { paths } from "@multica/core/paths";
import {
  channelListOptions,
  channelMembersOptions,
} from "@multica/core/channels";
import { agentListOptions, memberListOptions } from "@multica/core/workspace/queries";
import { ActorAvatar } from "../../common/actor-avatar";

interface WorkspaceLeftRailProps {
  workspaceSlug: string;
  workspaceId: string;
  /** Current active room id, used to highlight the room in the list and
   *  to scope the Members / Agents sections to the current room. */
  activeRoomId: string;
}

export function WorkspaceLeftRail({ workspaceSlug, workspaceId, activeRoomId }: WorkspaceLeftRailProps) {
  const { data: rooms = [] } = useQuery(channelListOptions(workspaceId));
  const { data: roomMembers = [] } = useQuery(channelMembersOptions(activeRoomId));
  const { data: agents = [] } = useQuery(agentListOptions(workspaceId));
  const { data: wsMembers = [] } = useQuery(memberListOptions(workspaceId));

  // Active-room agents: cross-reference channel members of type "agent"
  // with the agent registry so we can render names / avatars / status.
  const agentMemberIds = new Set(
    roomMembers.filter((m) => m.member_type === "agent").map((m) => m.member_id),
  );
  const roomAgents = agents.filter((a) => agentMemberIds.has(a.id) && !a.archived_at);

  // Active-room human members.
  const humanMemberIds = new Set(
    roomMembers.filter((m) => m.member_type === "human").map((m) => m.member_id),
  );
  const roomHumans = wsMembers.filter((m) => humanMemberIds.has(m.user_id));

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Brand */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="flex size-6 items-center justify-center rounded-md bg-brand/10 text-[11px] font-bold text-brand">
          B
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="truncate text-[12px] font-semibold">BONCML Workspace</span>
          <span className="truncate text-[10px] text-muted-foreground">{workspaceSlug}</span>
        </div>
      </div>

      {/* Search (visual placeholder for W1; real wiring is W2+) */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1.5 text-[11px] text-muted-foreground">
          <Search className="size-3" />
          <span>搜索房间 / 工件 / 审计</span>
        </div>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto px-1 pb-3">
        <RailSection title="ROOMS" count={rooms.length}>
          {rooms.length === 0 && <RailEmpty>暂无房间</RailEmpty>}
          {rooms.map((r) => {
            const href = paths.workspace(workspaceSlug).workspaceRoom(r.id);
            const active = r.id === activeRoomId;
            return (
              <AppLink
                key={r.id}
                href={href}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-2 py-1 text-[12px] transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                )}
              >
                {r.type === "private" ? (
                  <Lock className="size-3 shrink-0" />
                ) : (
                  <Hash className="size-3 shrink-0" />
                )}
                <span className="truncate">{r.name}</span>
                {r.unread_count !== undefined && r.unread_count > 0 && !active && (
                  <span className="ml-auto inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand px-1 text-[9px] font-medium text-brand-foreground">
                    {r.unread_count > 99 ? "99+" : r.unread_count}
                  </span>
                )}
              </AppLink>
            );
          })}
        </RailSection>

        <RailSection title="MEMBERS" count={roomHumans.length} icon={<Users className="size-3" />}>
          {roomHumans.length === 0 && <RailEmpty>暂无成员</RailEmpty>}
          {roomHumans.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center gap-2 rounded-sm px-2 py-1 text-[12px] text-muted-foreground"
            >
              <ActorAvatar actorType="member" actorId={m.user_id} size={16} />
              <span className="truncate">{m.name ?? m.user_id.slice(0, 8)}</span>
            </div>
          ))}
        </RailSection>

        <RailSection title="AGENTS" count={roomAgents.length} icon={<Bot className="size-3" />}>
          {roomAgents.length === 0 && <RailEmpty>暂无 Agent</RailEmpty>}
          {roomAgents.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-sm px-2 py-1 text-[12px] text-muted-foreground"
            >
              <ActorAvatar actorType="agent" actorId={a.id} size={16} />
              <span className="truncate">{a.name}</span>
            </div>
          ))}
        </RailSection>

        <RailSection title="SYSTEM" icon={<Activity className="size-3" />}>
          {/* W1 placeholder: real telemetry (queue depth, CPU, runtime
              version) lands when we have a status feed; for now this is
              a static stub so the section appears in the rail and the
              shell layout matches the mockup. */}
          <SystemStat label="mode" value="dev" />
          <SystemStat label="queue" value="0" />
          <SystemStat label="cpu" value="—" />
          <SystemStat label="mem" value="—" />
          <SystemStat label="runtime" value="—" />
        </RailSection>
      </div>
    </aside>
  );
}

function RailSection({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count?: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{title}</span>
        {count !== undefined && (
          <span className="ml-auto text-[9px] text-muted-foreground/70">{count}</span>
        )}
      </div>
      <div className="flex flex-col gap-px">{children}</div>
    </div>
  );
}

function RailEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-1 text-[11px] text-muted-foreground/60">{children}</div>;
}

function SystemStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-sm px-2 py-0.5 text-[11px]">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="text-muted-foreground tabular-nums">{value}</span>
    </div>
  );
}
