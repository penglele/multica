"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hash, Lock, Search, X } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@multica/ui/components/ui/dialog";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { Label } from "@multica/ui/components/ui/label";
import { useWorkspaceId } from "@multica/core/hooks";
import { agentListOptions, memberListOptions } from "@multica/core/workspace/queries";
import { useCreateChannel, useAddChannelMember } from "@multica/core/channels";
import { ActorAvatar } from "../../common/actor-avatar";

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (channelId: string) => void;
}

export function CreateChannelDialog({ open, onOpenChange, onCreated }: CreateChannelDialogProps) {
  const wsId = useWorkspaceId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  const createChannel = useCreateChannel();
  const addMember = useAddChannelMember();

  const filteredAgents = agents.filter((a) =>
    !a.archived_at && a.name.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredMembers = members.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()),
  );

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim()) return;
    const ch = await createChannel.mutateAsync({ name: name.trim(), description, type });
    // Add selected members
    for (const id of selectedIds) {
      const isAgent = agents.some((a) => a.id === id);
      await addMember.mutateAsync({
        channelId: ch.id,
        memberId: id,
        memberType: isAgent ? "agent" : "human",
      });
    }
    onCreated?.(ch.id);
    onOpenChange(false);
    setName(""); setDescription(""); setType("public"); setSearch(""); setSelectedIds(new Set());
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold uppercase tracking-wide">
            Create Channel
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wide">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ai-research"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wide">
              Description <span className="text-muted-foreground font-normal normal-case">(optional)</span>
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about?"
              rows={3}
            />
          </div>

          {/* Visibility */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wide">Visibility</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setType("public")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors",
                  type === "public"
                    ? "bg-yellow-400 border-yellow-400 text-black font-semibold"
                    : "border-border text-muted-foreground hover:border-foreground",
                )}
              >
                <Hash className="size-3.5" /> Public
              </button>
              <button
                onClick={() => setType("private")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors",
                  type === "private"
                    ? "bg-yellow-400 border-yellow-400 text-black font-semibold"
                    : "border-border text-muted-foreground hover:border-foreground",
                )}
              >
                <Lock className="size-3.5" /> Private
              </button>
            </div>
          </div>

          {/* Members */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wide">
              Members <span className="text-muted-foreground font-normal normal-case">(optional)</span>
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members by name"
                className="pl-8"
              />
            </div>
            <div className="border border-border rounded-md max-h-48 overflow-y-auto">
              {filteredAgents.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Agents
                  </div>
                  {filteredAgents.map((a) => (
                    <MemberRow
                      key={a.id}
                      id={a.id}
                      name={a.name}
                      actorType="agent"
                      selected={selectedIds.has(a.id)}
                      onToggle={toggleMember}
                    />
                  ))}
                </>
              )}
              {filteredMembers.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Humans
                  </div>
                  {filteredMembers.map((m) => (
                    <MemberRow
                      key={m.user_id}
                      id={m.user_id}
                      name={m.name}
                      actorType="member"
                      selected={selectedIds.has(m.user_id)}
                      onToggle={toggleMember}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || createChannel.isPending}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            Create Channel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  id, name, actorType, selected, onToggle,
}: {
  id: string; name: string; actorType: "agent" | "member";
  selected: boolean; onToggle: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onToggle(id)}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors",
        selected && "bg-muted",
      )}
    >
      <ActorAvatar actorType={actorType} actorId={id} size={24} />
      <span className="flex-1 text-left truncate">{name}</span>
      {selected && <X className="size-3.5 text-muted-foreground" />}
    </button>
  );
}
