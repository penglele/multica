"use client";

import { useQuery } from "@tanstack/react-query";
import { Hash, Plus, X, ChevronLeft, Settings } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { Button } from "@multica/ui/components/ui/button";
import { useWorkspaceId } from "@multica/core/hooks";
import { useAuthStore } from "@multica/core/auth";
import { useWSScopeSubscription } from "@multica/core/realtime";
import {
  channelListOptions,
  channelMessagesOptions,
  useChannelStore,
  useSendChannelMessage,
  useCreateChannel,
  useUpdateChannel,
} from "@multica/core/channels";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";

export function ChannelPanel() {
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);
  const isOpen = useChannelStore((s) => s.isOpen);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const openThreadId = useChannelStore((s) => s.openThreadId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const setOpen = useChannelStore((s) => s.setOpen);
  const closeThread = useChannelStore((s) => s.closeThread);

  const { data: channels = [] } = useQuery(channelListOptions(wsId));
  const { data: messages = [] } = useQuery(
    channelMessagesOptions(activeChannelId ?? ""),
  );

  const sendMessage = useSendChannelMessage();
  const createChannel = useCreateChannel();

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  useWSScopeSubscription("channel", activeChannelId);

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
        <div className="flex flex-col flex-1 min-h-0">
          {openThreadId ? (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs text-muted-foreground">
                <Button variant="ghost" size="icon" className="size-5" onClick={closeThread}>
                  <ChevronLeft className="size-3" />
                </Button>
                Thread
              </div>
              <ThreadView parentId={openThreadId} userId={user?.id} />
            </div>
          ) : (
            <>
              <MessageList
                messages={messages}
                currentUserId={user?.id}
                onThreadClick={(id) => useChannelStore.getState().openThread(id)}
                onRetry={(failed) => {
                  if (!failed.client_message_id) return;
                  sendMessage.mutate({
                    channelId: failed.channel_id,
                    content: failed.content,
                    threadParentId: failed.thread_parent_id,
                    clientMessageId: failed.client_message_id,
                    senderId: user?.id,
                  });
                }}
              />
              <MessageInput
                onSend={(content) =>
                  sendMessage.mutate({
                    channelId: activeChannel.id,
                    content,
                    // Mint a per-send id so optimistic insert + idempotent retry
                    // both work in this simpler panel. Each send is its own draft.
                    clientMessageId:
                      typeof crypto !== "undefined" && "randomUUID" in crypto
                        ? crypto.randomUUID()
                        : `cid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    senderId: user?.id,
                  })
                }
                disabled={sendMessage.isPending}
              />
            </>
          )}
        </div>
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

function ThreadView({ parentId, userId }: { parentId: string; userId?: string }) {
  const { data: replies = [] } = useQuery({
    queryKey: ["channel-thread", parentId],
    queryFn: () => import("@multica/core/api").then((m) => m.api.listThreadReplies(parentId)),
    enabled: !!parentId,
    staleTime: Infinity,
  });
  const sendMessage = useSendChannelMessage();
  const channelId = replies[0]?.channel_id ?? "";

  return (
    <>
      <MessageList
        messages={replies}
        currentUserId={userId}
        onRetry={(failed) => {
          if (!failed.client_message_id) return;
          sendMessage.mutate({
            channelId: failed.channel_id,
            content: failed.content,
            threadParentId: failed.thread_parent_id,
            clientMessageId: failed.client_message_id,
            senderId: userId,
          });
        }}
      />
      <MessageInput
        onSend={(content) =>
          sendMessage.mutate({
            channelId,
            content,
            threadParentId: parentId,
            clientMessageId:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `cid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            senderId: userId,
          })
        }
        disabled={sendMessage.isPending || !channelId}
        placeholder="回复..."
      />
    </>
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
