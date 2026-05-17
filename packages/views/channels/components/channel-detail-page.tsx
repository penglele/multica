"use client";

// ChannelDetailPage is the full-page shell for a single channel. The body
// (messages + composer + thread panel) is shared with ChannelPanel via
// ChannelConversation; this file owns only the page-level chrome:
//   - PageHeader (channel name, member count, auto-reply quick toggle)
//   - members dialog
// Behavior changes go in channel-conversation.tsx — modify here only when
// you need page-level affordances that don't apply to the side-panel view.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hash, Lock, Settings, Users } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { Button } from "@multica/ui/components/ui/button";
import { useWorkspaceId } from "@multica/core/hooks";
import { PageHeader } from "../../layout/page-header";
import { channelDetailOptions, useUpdateChannel } from "@multica/core/channels";
import { ChannelMembersDialog } from "./channel-members-dialog";
import { ChannelConversation } from "./channel-conversation";
import { channelMembersOptions } from "@multica/core/channels";

export function ChannelDetailPage({ channelId }: { channelId: string }) {
  const wsId = useWorkspaceId();
  const [membersOpen, setMembersOpen] = useState(false);

  const { data: channel } = useQuery(channelDetailOptions(wsId, channelId));
  const { data: members = [] } = useQuery(channelMembersOptions(channelId));

  const updateChannel = useUpdateChannel();

  if (!channel) return null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader>
        <div className="flex flex-1 items-center gap-2 min-w-0">
          {channel.type === "private" ? (
            <Lock className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Hash className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="font-semibold text-sm truncate">{channel.name}</span>
          {channel.description && (
            <span className="text-xs text-muted-foreground truncate hidden sm:block">
              — {channel.description}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setMembersOpen(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            <Users className="size-3.5" />
            <span>{members.length}</span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 gap-1 text-xs", channel.auto_reply && "text-brand")}
            onClick={() => updateChannel.mutate({ id: channel.id, auto_reply: !channel.auto_reply })}
            title={channel.auto_reply ? "关闭自动接话" : "开启自动接话"}
          >
            <Settings className="size-3.5" />
            {channel.auto_reply ? "自动接话" : "手动"}
          </Button>
        </div>
      </PageHeader>

      <ChannelConversation key={channelId} channelId={channelId} density="comfortable" />

      <ChannelMembersDialog
        channelId={channelId}
        open={membersOpen}
        onOpenChange={setMembersOpen}
      />
    </div>
  );
}
