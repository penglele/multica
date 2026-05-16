"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@multica/ui/components/ui/dialog";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { useWorkspaceId } from "@multica/core/hooks";
import { agentListOptions, memberListOptions } from "@multica/core/workspace/queries";
import {
  channelMembersOptions,
  useAddChannelMember,
  useRemoveChannelMember,
} from "@multica/core/channels";
import { ActorAvatar } from "../../common/actor-avatar";

interface ChannelMembersDialogProps {
  channelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChannelMembersDialog({ channelId, open, onOpenChange }: ChannelMembersDialogProps) {
  const wsId = useWorkspaceId();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");

  const { data: channelMembers = [] } = useQuery(channelMembersOptions(channelId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: wsMembers = [] } = useQuery(memberListOptions(wsId));

  const addMember = useAddChannelMember();
  const removeMember = useRemoveChannelMember();

  const memberIds = new Set(channelMembers.map((m) => m.member_id));

  const agentMembers = channelMembers.filter((m) => m.member_type === "agent");
  const humanMembers = channelMembers.filter((m) => m.member_type === "human");

  // Candidates not yet in channel
  const candidateAgents = agents.filter(
    (a) => !a.archived_at && !memberIds.has(a.id) && a.name.toLowerCase().includes(search.toLowerCase()),
  );
  const candidateHumans = wsMembers.filter(
    (m) => !memberIds.has(m.user_id) && m.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-bold uppercase tracking-wide">
            Members ({channelMembers.length})
          </DialogTitle>
        </DialogHeader>

        <div className="border border-border rounded-md max-h-72 overflow-y-auto">
          {agentMembers.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Agents
              </div>
              {agentMembers.map((m) => {
                const agent = agents.find((a) => a.id === m.member_id);
                return (
                  <MemberListRow
                    key={m.member_id}
                    id={m.member_id}
                    name={agent?.name ?? m.member_id.slice(0, 8)}
                    actorType="agent"
                    status={agent?.status}
                    onRemove={() => removeMember.mutate({ channelId, memberId: m.member_id })}
                  />
                );
              })}
            </>
          )}
          {humanMembers.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Humans
              </div>
              {humanMembers.map((m) => {
                const wsMember = wsMembers.find((wm) => wm.user_id === m.member_id);
                return (
                  <MemberListRow
                    key={m.member_id}
                    id={m.member_id}
                    name={wsMember?.name ?? m.member_id.slice(0, 8)}
                    actorType="member"
                    onRemove={() => removeMember.mutate({ channelId, memberId: m.member_id })}
                  />
                );
              })}
            </>
          )}
        </div>

        {/* Add member section */}
        {showAdd ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members by name"
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="border border-border rounded-md max-h-40 overflow-y-auto">
              {candidateAgents.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Agents
                  </div>
                  {candidateAgents.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => addMember.mutate({ channelId, memberId: a.id, memberType: "agent" })}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <ActorAvatar actorType="agent" actorId={a.id} size={24} />
                      <span className="flex-1 text-left truncate">{a.name}</span>
                      <Plus className="size-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </>
              )}
              {candidateHumans.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Humans
                  </div>
                  {candidateHumans.map((m) => (
                    <button
                      key={m.user_id}
                      onClick={() => addMember.mutate({ channelId, memberId: m.user_id, memberType: "human" })}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                    >
                      <ActorAvatar actorType="member" actorId={m.user_id} size={24} />
                      <span className="flex-1 text-left truncate">{m.name}</span>
                      <Plus className="size-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </>
              )}
              {candidateAgents.length === 0 && candidateHumans.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">没有更多成员可添加</p>
              )}
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full bg-pink-100 hover:bg-pink-200 border-pink-200 text-pink-700"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-4 mr-1" /> Add Member
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MemberListRow({
  id, name, actorType, status, onRemove,
}: {
  id: string; name: string; actorType: "agent" | "member";
  status?: string; onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-2.5 px-3 py-2.5">
      <div className="relative shrink-0">
        <ActorAvatar actorType={actorType} actorId={id} size={32} />
        {actorType === "agent" && (
          <span
            className={cn(
              "absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background",
              status === "idle" || status === "working" ? "bg-green-500" : "bg-muted-foreground/40",
            )}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        {actorType === "agent" && status && (
          <p className="text-[11px] text-muted-foreground capitalize">{status === "idle" ? "Online" : status === "offline" ? "Offline" : status}</p>
        )}
      </div>
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
