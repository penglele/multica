"use client";

import { useEffect, useRef } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import type { ChannelMessage, ChannelMessageTarget } from "@multica/core/channels";
import { ActorAvatar } from "../../common/actor-avatar";

interface MessageListProps {
  messages: ChannelMessage[];
  currentUserId?: string;
  onThreadClick?: (messageId: string) => void;
  onRetry?: (msg: ChannelMessage) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function targetStatusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case "queued":    return { text: "排队中",  className: "text-muted-foreground" };
    case "running":   return { text: "处理中",  className: "text-brand" };
    case "completed": return { text: "已完成",  className: "text-muted-foreground" };
    case "failed":    return { text: "失败",    className: "text-destructive" };
    case "cancelled": return { text: "已取消",  className: "text-muted-foreground" };
    default:          return { text: status,   className: "text-muted-foreground" };
  }
}

function TargetsFooter({ targets }: { targets: ChannelMessageTarget[] }) {
  return (
    <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
      <span>已交给</span>
      {targets.map((t, i) => {
        const lbl = targetStatusLabel(t.status);
        const isRunning = t.status === "running";
        return (
          <span key={`${t.kind}:${t.id}`} className="inline-flex items-center gap-1">
            <span className="font-medium text-foreground/80">@{t.name}</span>
            <span className={cn("inline-flex items-center gap-0.5 px-1 rounded", lbl.className)}>
              {isRunning && <Loader2 className="size-2.5 animate-spin" />}
              {lbl.text}
            </span>
            {i < targets.length - 1 && <span>·</span>}
          </span>
        );
      })}
    </div>
  );
}

export function MessageList({ messages, currentUserId, onThreadClick, onRetry }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        暂无消息，发送第一条消息开始对话
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
      {messages.map((msg) => {
        const isOwn = msg.sender_id === currentUserId;
        const isAgent = msg.sender_type === "agent";
        const isSending = msg.delivery_status === "sending";
        const isFailed = msg.delivery_status === "failed";
        return (
          <div
            key={msg.id}
            className={cn(
              "group flex items-start gap-2 py-0.5 px-1 rounded",
              isSending && "opacity-60",
              isFailed && "bg-destructive/5",
            )}
          >
            <ActorAvatar
              actorType={isAgent ? "agent" : "member"}
              actorId={msg.sender_id}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className={cn("text-xs font-medium", isAgent && "text-brand")}>
                  {isAgent ? "Agent" : isOwn ? "You" : msg.sender_id.slice(0, 8)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {isSending ? "发送中…" : formatTime(msg.created_at)}
                </span>
                {isFailed && (
                  <span className="text-[10px] text-destructive font-medium">发送失败</span>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
              {isFailed && msg.error_message && (
                <p className="mt-0.5 text-[10px] text-destructive">{msg.error_message}</p>
              )}
              {isFailed && onRetry && (
                <button
                  onClick={() => onRetry(msg)}
                  className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-destructive hover:text-destructive/80 underline-offset-2 hover:underline"
                >
                  <RotateCw className="size-2.5" /> 重试
                </button>
              )}
              {msg.targets && msg.targets.length > 0 && (
                <TargetsFooter targets={msg.targets} />
              )}
              {onThreadClick && !isSending && !isFailed && (
                <button
                  onClick={() => onThreadClick(msg.id)}
                  className="text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                >
                  回复
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
