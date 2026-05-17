"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hash, Lock, Settings, Users, X, ChevronRight, Send } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { Button } from "@multica/ui/components/ui/button";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { useWorkspaceId } from "@multica/core/hooks";
import { useAuthStore } from "@multica/core/auth";
import { useWSScopeSubscription } from "@multica/core/realtime";
import { PageHeader } from "../../layout/page-header";
import {
  channelDetailOptions,
  channelMessagesOptions,
  channelMembersOptions,
  channelThreadOptions,
  useSendChannelMessage,
  useUpdateChannel,
} from "@multica/core/channels";
import type { ChannelMessage } from "@multica/core/channels";
import { ActorAvatar } from "../../common/actor-avatar";
import { agentListOptions } from "@multica/core/workspace/queries";

import { ChannelMembersDialog } from "./channel-members-dialog";

// ---------------------------------------------------------------------------
// ChannelDetailPage
// ---------------------------------------------------------------------------

export function ChannelDetailPage({ channelId }: { channelId: string }) {
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);

  const { data: channel } = useQuery(channelDetailOptions(wsId, channelId));
  const { data: messages = [] } = useQuery(channelMessagesOptions(channelId));
  const { data: members = [] } = useQuery(channelMembersOptions(channelId));

  const sendMessage = useSendChannelMessage();
  const updateChannel = useUpdateChannel();

  useWSScopeSubscription("channel", channelId);

  if (!channel) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
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
          {/* Member count — click to open members dialog */}
          <button
            onClick={() => setMembersOpen(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            <Users className="size-3.5" />
            <span>{members.length}</span>
          </button>
          {/* Auto-reply toggle */}
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

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <MessageFeed
            messages={messages}
            currentUserId={user?.id}
            onThreadClick={setOpenThreadId}
            activeThreadId={openThreadId}
          />
          <MessageComposer
            onSend={(content) =>
              sendMessage.mutate({ channelId: channel.id, content })
            }
            disabled={sendMessage.isPending}
            channelId={channel.id}
          />
        </div>
        {openThreadId && (
          <ThreadPanel
            parentId={openThreadId}
            channelId={channel.id}
            currentUserId={user?.id}
            onClose={() => setOpenThreadId(null)}
          />
        )}
      </div>

      <ChannelMembersDialog
        channelId={channelId}
        open={membersOpen}
        onOpenChange={setMembersOpen}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageFeed
// ---------------------------------------------------------------------------

function MessageFeed({
  messages,
  currentUserId,
  onThreadClick,
  activeThreadId,
}: {
  messages: ChannelMessage[];
  currentUserId?: string;
  onThreadClick: (id: string) => void;
  activeThreadId: string | null;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        还没有消息，发送第一条消息开始对话
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5">
      {messages.map((msg) => (
        <MessageRow
          key={msg.id}
          msg={msg}
          currentUserId={currentUserId}
          onThreadClick={onThreadClick}
          isThreadActive={activeThreadId === msg.id}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageRow({
  msg,
  currentUserId,
  onThreadClick,
  isThreadActive,
}: {
  msg: ChannelMessage;
  currentUserId?: string;
  onThreadClick: (id: string) => void;
  isThreadActive: boolean;
}) {
  const isAgent = msg.sender_type === "agent";

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors",
        isThreadActive && "bg-muted/60",
      )}
    >
      <ActorAvatar
        actorType={isAgent ? "agent" : "member"}
        actorId={msg.sender_id}
        size={28}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-sm font-medium", isAgent && "text-brand")}>
            {isAgent ? "Agent" : msg.sender_id === currentUserId ? "You" : "Member"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
      </div>
      {/* Reply button on hover */}
      <button
        onClick={() => onThreadClick(msg.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 mt-1"
      >
        <ChevronRight className="size-3" />
        回复
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageComposer with @mention autocomplete
// ---------------------------------------------------------------------------

function MessageComposer({
  onSend,
  disabled,
  placeholder = "发送消息... (@mention 触发 agent)",
  channelId,
}: {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  channelId?: string;
}) {
  const [value, setValue] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  const { data: members = [] } = useQuery({
    ...channelMembersOptions(channelId ?? ""),
    enabled: !!channelId,
  });
  const wsId = useWorkspaceId();
  const { data: agents = [] } = useQuery(agentListOptions(wsId));

  // Detect @mention trigger
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    const match = v.match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(match ? (match[1] ?? "") : null);
  }

  // Agent members in this channel
  const agentMemberIds = new Set(members.filter((m) => m.member_type === "agent").map((m) => m.member_id));
  const agentSuggestions = agents.filter(
    (a) => agentMemberIds.has(a.id) && (!mentionQuery || a.name.toLowerCase().startsWith(mentionQuery.toLowerCase())),
  );

  function insertMention(name: string) {
    setValue((v) => v.replace(/(?:^|\s)@[^\s@]*$/, (matched) => `${matched.slice(0, -matched.trimStart().length)}@${name} `));
    setMentionQuery(null);
    ref.current?.focus();
  }

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    setMentionQuery(null);
    ref.current?.focus();
  }, [value, disabled, onSend]);

  return (
    <div className="px-4 pb-4 pt-2">
      {/* @mention dropdown */}
      {mentionQuery !== null && agentSuggestions.length > 0 && (
        <div className="mb-1 border border-border rounded-lg bg-background shadow-sm overflow-hidden">
          {agentSuggestions.map((a) => (
            <button
              key={a.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(a.name); }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 text-left"
            >
              <ActorAvatar actorType="agent" actorId={a.id} size={20} />
              <span>@{a.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
        <Textarea
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setMentionQuery(null); return; }
            if (e.key === "Enter" && !e.shiftKey && mentionQuery === null) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 border-0 bg-transparent p-0 text-sm resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[24px] max-h-[120px]"
        />
        <Button
          size="icon"
          className="size-7 shrink-0"
          onClick={handleSend}
          disabled={!value.trim() || disabled}
        >
          <Send className="size-3.5" />
        </Button>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground px-1">
        Enter 发送 · Shift+Enter 换行 · @name 触发 agent
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThreadPanel
// ---------------------------------------------------------------------------

function ThreadPanel({
  parentId,
  channelId,
  currentUserId,
  onClose,
}: {
  parentId: string;
  channelId: string;
  currentUserId?: string;
  onClose: () => void;
}) {
  const { data: replies = [] } = useQuery(channelThreadOptions(parentId));
  const sendMessage = useSendChannelMessage();

  return (
    <div className="flex flex-col w-[320px] shrink-0 border-l border-border">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium">Thread</span>
        <Button variant="ghost" size="icon" className="size-6" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {replies.map((msg) => (
          <MessageRow
            key={msg.id}
            msg={msg}
            currentUserId={currentUserId}
            onThreadClick={() => {}} // no nested threads
            isThreadActive={false}
          />
        ))}
        {replies.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">暂无回复</p>
        )}
      </div>
      <MessageComposer
        onSend={(content) =>
          sendMessage.mutate({ channelId, content, threadParentId: parentId })
        }
        disabled={sendMessage.isPending}
        placeholder="回复..."
      />
    </div>
  );
}
