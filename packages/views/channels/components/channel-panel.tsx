"use client";

// ChannelPanel is the side-panel shell for a channel — a 360px column that
// docks to the right of the workspace. The conversation body itself lives
// in ChannelConversation, shared with ChannelDetailPage; this file only
// owns:
//   - panel chrome (back / close / new-channel buttons)
//   - the channel list shown when no channel is selected
//   - the auto-reply quick toggle
// Behavior changes belong in channel-conversation.tsx; modify here only
// for panel-specific affordances.

import { useQuery } from "@tanstack/react-query";
import { Hash, Plus, X, ChevronLeft, Settings } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { Button } from "@multica/ui/components/ui/button";
import { useWorkspaceId } from "@multica/core/hooks";
import {
  channelListOptions,
  useChannelStore,
  useCreateChannel,
  useUpdateChannel,
} from "@multica/core/channels";
import { ChannelConversation } from "./channel-conversation";

export function ChannelPanel() {
  const wsId = useWorkspaceId();
  const isOpen = useChannelStore((s) => s.isOpen);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const setOpen = useChannelStore((s) => s.setOpen);

  const { data: channels = [] } = useQuery(channelListOptions(wsId));
  const createChannel = useCreateChannel();

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  if (!isOpen) return null;

  return (
    <div className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        {activeChannel ? (
          <>
            <div className="flex items-center gap-1.5 min-w-0">
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => setActiveChannel(null)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Hash className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium truncate">{activeChannel.name}</span>
            </div>
            <div className="flex items-center gap-1">
              <AutoReplyToggle channel={activeChannel} />
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => setOpen(false)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">频道</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => createChannel.mutate({ name: `channel-${Date.now()}` })}
                title="新建频道"
              >
                <Plus className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => setOpen(false)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Body */}
      {activeChannel ? (
        <ChannelConversation key={activeChannel.id} channelId={activeChannel.id} density="compact" />
      ) : (
        <ChannelList channels={channels} onSelect={setActiveChannel} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChannelList({
  channels,
  onSelect,
}: {
  channels: { id: string; name: string; type: string }[];
  onSelect: (id: string) => void;
}) {
  if (channels.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
        还没有频道，点击 + 创建第一个
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto py-1">
      {channels.map((ch) => (
        <button
          key={ch.id}
          onClick={() => onSelect(ch.id)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-sidebar-accent rounded-sm mx-1 text-left"
        >
          <Hash className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{ch.name}</span>
        </button>
      ))}
    </div>
  );
}

function AutoReplyToggle({ channel }: { channel: { id: string; auto_reply: boolean } }) {
  const update = useUpdateChannel();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-6", channel.auto_reply && "text-brand")}
      title={channel.auto_reply ? "关闭自动接话" : "开启自动接话"}
      onClick={() => update.mutate({ id: channel.id, auto_reply: !channel.auto_reply })}
    >
      <Settings className="size-3.5" />
    </Button>
  );
}
