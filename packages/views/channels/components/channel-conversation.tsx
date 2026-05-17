"use client";

// ChannelConversation is the shared body used by both the full-page channel
// view (ChannelDetailPage) and the side-panel channel view (ChannelPanel).
// Everything that's "channel-as-conversation" lives here:
//   - data fetching for messages, members, agents, workspace members
//   - subscribe to the channel WS scope
//   - auto-mark-read effect
//   - load-earlier pagination (resolves to 0 → hide button)
//   - send + retry plumbing (B1 idempotent retry via client_message_id)
//   - thread side panel
//
// Page-level concerns (header, members dialog, page chrome) stay in the
// caller. The same wholly applies to compact panel-level concerns.

import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, RotateCw, Loader2, Copy, X } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { Button } from "@multica/ui/components/ui/button";
import { FileUploadButton } from "@multica/ui/components/common/file-upload-button";
import { SubmitButton } from "@multica/ui/components/common/submit-button";
import { useWorkspaceId } from "@multica/core/hooks";
import { useAuthStore } from "@multica/core/auth";
import { useWSScopeSubscription } from "@multica/core/realtime";
import { api } from "@multica/core/api";
import { useFileUpload, type UploadResult } from "@multica/core/hooks/use-file-upload";
import { Markdown } from "../../common/markdown";
import {
  ContentEditor,
  type ContentEditorRef,
  copyMarkdown,
  useFileDropZone,
  FileDropOverlay,
} from "../../editor";
import { formatElapsedMs } from "../../chat/lib/format";
import {
  channelMessagesOptions,
  channelMembersOptions,
  channelThreadOptions,
  useSendChannelMessage,
  useMarkChannelRead,
  useLoadEarlierChannelMessages,
  useChannelStore,
} from "@multica/core/channels";
import type { ChannelMessage } from "@multica/core/channels";
import { ActorAvatar } from "../../common/actor-avatar";
import { agentListOptions, memberListOptions } from "@multica/core/workspace/queries";

// ---------------------------------------------------------------------------
// ChannelConversation — public shared body
// ---------------------------------------------------------------------------

interface ChannelConversationProps {
  channelId: string;
  /** Visual padding hint. The full-page view is "comfortable"; the panel
   *  view is "compact" so it fits in a 320px column. Doesn't change
   *  behavior, only sizing. */
  density?: "comfortable" | "compact";
  /** Reserved for A2 — when `true`, ChannelComposer's stop button is
   *  visible and `onStop` is invoked. Channels don't have a single
   *  in-flight task today, so default false; this is here to keep the
   *  prop surface stable for future per-channel cancellation. */
  isRunning?: boolean;
  onStop?: () => void;
}

export function ChannelConversation({ channelId, density = "comfortable", isRunning, onStop }: ChannelConversationProps) {
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const { data: messages = [] } = useQuery(channelMessagesOptions(channelId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: wsMembers = [] } = useQuery(memberListOptions(wsId));

  const sendMessage = useSendChannelMessage();
  const markRead = useMarkChannelRead();
  const loadEarlier = useLoadEarlierChannelMessages();

  // Once a load returns 0 we know we've reached the start of history and
  // can stop showing the button. State is local to this conversation
  // (cleared on channelId change because the component remounts when the
  // shell uses key={channelId}; if not, this is still fine — just a brief
  // stale flag).
  const [reachedStart, setReachedStart] = useState(false);
  useEffect(() => {
    setReachedStart(false);
  }, [channelId]);

  useWSScopeSubscription("channel", channelId);

  // Auto-advance the channel's read cursor whenever the user is looking at
  // it AND new messages have arrived. Key on the highest seq currently in
  // the message cache.
  const highestSeq = messages.length > 0 ? messages[messages.length - 1]?.seq ?? 0 : 0;
  const lastMarkedRef = useRef<number>(0);
  useEffect(() => {
    if (!channelId || highestSeq <= 0) return;
    if (highestSeq <= lastMarkedRef.current) return;
    lastMarkedRef.current = highestSeq;
    markRead.mutate({ channelId, lastReadSeq: highestSeq });
    // markRead is stable enough to not include in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, highestSeq]);

  return (
    <div className="flex flex-1 min-h-0">
      {!(density === "compact" && openThreadId) && (
        <div className="flex flex-col flex-1 min-w-0 min-h-0">
          <MessageFeed
            messages={messages}
            currentUserId={user?.id}
            onThreadClick={setOpenThreadId}
            activeThreadId={openThreadId}
            agents={agents}
            wsMembers={wsMembers}
            density={density}
            hasMore={!reachedStart}
            isLoadingEarlier={loadEarlier.isPending}
            onLoadEarlier={async () => {
              const got = await loadEarlier.mutateAsync({ channelId });
              if (got === 0) setReachedStart(true);
            }}
            onRetry={(failed) => {
              if (!failed.client_message_id) return;
              // Retry uses the same client_message_id so the server's unique
              // index dedups in case the previous attempt actually committed.
              sendMessage.mutate({
                channelId: failed.channel_id,
                content: failed.content,
                threadParentId: failed.thread_parent_id,
                clientMessageId: failed.client_message_id,
                senderId: user?.id,
              });
            }}
          />
          <MessageComposer
            channelId={channelId}
            density={density}
            disabled={sendMessage.isPending}
            isRunning={isRunning}
            onStop={onStop}
            onSend={async (content, opts) =>
              sendMessage.mutateAsync({
                channelId,
                content,
                triggerMode: opts?.triggerMode,
                targets: opts?.targets,
                clientMessageId: opts?.clientMessageId,
                senderId: user?.id,
              })
            }
          />
        </div>
      )}
      {openThreadId && (
        <ThreadPanel
          parentId={openThreadId}
          channelId={channelId}
          currentUserId={user?.id}
          onClose={() => setOpenThreadId(null)}
          agents={agents}
          wsMembers={wsMembers}
          // In a 360px-wide panel there isn't room for a 320px thread
          // sidebar AND the message feed, so the panel replaces the body.
          // The full page keeps the side-by-side layout.
          fullWidth={density === "compact"}
        />
      )}
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
  agents = [],
  wsMembers = [],
  onRetry,
  onLoadEarlier,
  hasMore = true,
  isLoadingEarlier = false,
  density = "comfortable",
}: {
  messages: ChannelMessage[];
  currentUserId?: string;
  onThreadClick: (id: string) => void;
  activeThreadId: string | null;
  agents?: import("@multica/core/types").Agent[];
  wsMembers?: import("@multica/core/types").MemberWithUser[];
  onRetry?: (msg: ChannelMessage) => void;
  onLoadEarlier?: () => void;
  hasMore?: boolean;
  isLoadingEarlier?: boolean;
  density?: "comfortable" | "compact";
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Auto-scroll to bottom only when the user is already near the bottom.
  // After they pull up to read history we don't want a new agent reply to
  // yank them back down.
  const lastLenRef = useRef(0);
  useEffect(() => {
    const c = containerRef.current;
    const grew = messages.length > lastLenRef.current;
    lastLenRef.current = messages.length;
    if (!c || !grew) return;
    const fromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
    if (fromBottom < 200) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        还没有消息，发送第一条消息开始对话
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex-1 overflow-y-auto space-y-0.5",
        density === "compact" ? "px-3 py-2" : "px-4 py-3",
      )}
    >
      {onLoadEarlier && hasMore && (
        <div className="flex justify-center pb-2">
          <button
            onClick={onLoadEarlier}
            disabled={isLoadingEarlier}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1 rounded hover:bg-muted disabled:opacity-50 disabled:cursor-wait inline-flex items-center gap-1"
          >
            {isLoadingEarlier && <Loader2 className="size-3 animate-spin" />}
            {isLoadingEarlier ? "加载中…" : "加载更早消息"}
          </button>
        </div>
      )}
      {messages.map((msg, i) => {
        // For agent messages: distance from the most-recent human message
        // before this one in the same channel feed. Used to render a small
        // "回复耗时" pill so users get the same elapsed-time signal main chat
        // gives them. Skips when there's no preceding human (e.g. agent-first
        // turn, or filtered into a thread view).
        let replyElapsedMs: number | undefined;
        if (msg.sender_type === "agent") {
          for (let j = i - 1; j >= 0; j--) {
            const prev = messages[j];
            if (prev?.sender_type === "human") {
              const ms = Date.parse(msg.created_at) - Date.parse(prev.created_at);
              if (Number.isFinite(ms) && ms >= 0) replyElapsedMs = ms;
              break;
            }
          }
        }
        return (
          <MessageRow
            key={msg.id}
            msg={msg}
            currentUserId={currentUserId}
            onThreadClick={onThreadClick}
            isThreadActive={activeThreadId === msg.id}
            agents={agents}
            wsMembers={wsMembers}
            onRetry={onRetry}
            replyElapsedMs={replyElapsedMs}
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageRow
// ---------------------------------------------------------------------------

function MessageRow({
  msg,
  currentUserId,
  onThreadClick,
  isThreadActive,
  agents = [],
  wsMembers = [],
  onRetry,
  replyElapsedMs,
}: {
  msg: ChannelMessage;
  currentUserId?: string;
  onThreadClick: (id: string) => void;
  isThreadActive: boolean;
  agents?: import("@multica/core/types").Agent[];
  wsMembers?: import("@multica/core/types").MemberWithUser[];
  onRetry?: (msg: ChannelMessage) => void;
  replyElapsedMs?: number;
}) {
  const isAgent = msg.sender_type === "agent";

  // Resolve display name
  let displayName = "Unknown";
  if (isAgent) {
    const agent = agents.find((a) => a.id === msg.sender_id);
    displayName = agent?.name ?? msg.sender_id.slice(0, 8);
  } else if (msg.sender_id === currentUserId) {
    displayName = "You";
  } else {
    const member = wsMembers.find((m) => m.user_id === msg.sender_id);
    displayName = member?.name ?? msg.sender_id.slice(0, 8);
  }

  const isSending = msg.delivery_status === "sending";
  const isFailed = msg.delivery_status === "failed";

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-2 py-1.5 rounded-lg hover:bg-muted/40 transition-colors",
        isThreadActive && "bg-muted/60",
        isSending && "opacity-60",
        isFailed && "bg-destructive/5",
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
            {displayName}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {isSending ? "发送中…" : new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {isAgent && replyElapsedMs !== undefined && replyElapsedMs > 0 && (
            <span className="text-[10px] text-muted-foreground/70">
              · {formatElapsedMs(replyElapsedMs)}
            </span>
          )}
          {isFailed && (
            <span className="text-[10px] text-destructive font-medium">发送失败</span>
          )}
        </div>
        <div className="text-sm break-words">
          <Markdown>{msg.content}</Markdown>
        </div>
        {isFailed && msg.error_message && (
          <p className="mt-0.5 text-[11px] text-destructive">{msg.error_message}</p>
        )}
        {isFailed && onRetry && (
          <button
            onClick={() => onRetry(msg)}
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-destructive hover:text-destructive/80 underline-offset-2 hover:underline"
          >
            <RotateCw className="size-3" /> 重试
          </button>
        )}
        {msg.targets && msg.targets.length > 0 && <MessageTargetsFooter targets={msg.targets} />}
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex flex-col items-end gap-0.5 mt-1">
        {!isSending && !isFailed && (
          <button
            onClick={async () => {
              try {
                await copyMarkdown(msg.content);
                toast.success("已复制");
              } catch {
                toast.error("复制失败");
              }
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            title="复制"
          >
            <Copy className="size-3" />
          </button>
        )}
        <button
          onClick={() => onThreadClick(msg.id)}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
        >
          <ChevronRight className="size-3" />
          回复
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageTargetsFooter — B0 minimal feedback line under user messages.
// ---------------------------------------------------------------------------

function statusLabel(status: string): { text: string; className: string } {
  switch (status) {
    case "queued":    return { text: "排队中", className: "text-muted-foreground" };
    case "running":   return { text: "处理中", className: "text-brand" };
    case "completed": return { text: "已完成", className: "text-muted-foreground" };
    case "failed":    return { text: "失败",   className: "text-destructive" };
    case "cancelled": return { text: "已取消", className: "text-muted-foreground" };
    default:          return { text: status,   className: "text-muted-foreground" };
  }
}

function MessageTargetsFooter({ targets }: { targets: import("@multica/core/channels").ChannelMessageTarget[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
      <span>已交给</span>
      {targets.map((t, i) => {
        const lbl = statusLabel(t.status);
        const isRunning = t.status === "running";
        return (
          <span key={`${t.kind}:${t.id}`} className="inline-flex items-center gap-1">
            <span className="font-medium text-foreground/80">@{t.name}</span>
            <span className={cn("inline-flex items-center gap-0.5 px-1 py-px rounded text-[10px]", lbl.className)}>
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

// ---------------------------------------------------------------------------
// MessageComposer with @mention autocomplete + structured target picker (B1)
// ---------------------------------------------------------------------------

type ComposerSendOptions = {
  triggerMode?: "none" | "manual" | "auto";
  targets?: { kind: "agent"; id: string }[];
  clientMessageId?: string;
};

// mintClientMessageId returns a stable id used for idempotent send. The same
// draft must reuse the same id across retries, so this is meant to be called
// at the moment a draft starts (first keystroke), not on every send click.
function mintClientMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function MessageComposer({
  onSend,
  disabled,
  placeholder = "发送消息...",
  channelId,
  draftScope,
  density = "comfortable",
  isRunning,
  onStop,
}: {
  onSend: (content: string, opts?: ComposerSendOptions) => void | Promise<unknown>;
  disabled?: boolean;
  placeholder?: string;
  channelId?: string;
  /** zustand draft key. Defaults to channelId so each channel gets its own
   *  persistent draft. Threads pass `thread:<parentId>` to keep the thread
   *  composer's draft separate from the main channel's. */
  draftScope?: string;
  density?: "comfortable" | "compact";
  isRunning?: boolean;
  onStop?: () => void;
}) {
  const editorRef = useRef<ContentEditorRef>(null);
  // B1 target picker.
  const [targetMode, setTargetMode] = useState<string>("follow");
  const [pickerOpen, setPickerOpen] = useState(false);
  const draftIdRef = useRef<string | null>(null);

  // Per-channel drafts. The chat side uses the same pattern via
  // `useChatStore.inputDrafts`; we mirror it on `useChannelStore` so a
  // half-typed message survives a channel switch and is restored when the
  // user comes back. Cleared on successful send.
  const draftKey = draftScope ?? channelId ?? "";
  const inputDraft = useChannelStore((s) => s.inputDrafts[draftKey] ?? "");
  const setInputDraft = useChannelStore((s) => s.setInputDraft);
  const clearInputDraft = useChannelStore((s) => s.clearInputDraft);
  const [isEmpty, setIsEmpty] = useState(!inputDraft.trim());
  const [pendingUploads, setPendingUploads] = useState(0);

  const { data: members = [] } = useQuery({
    ...channelMembersOptions(channelId ?? ""),
    enabled: !!channelId,
  });
  const wsId = useWorkspaceId();
  const { data: agents = [] } = useQuery(agentListOptions(wsId));

  const { uploadWithToast } = useFileUpload(api, (err) => {
    toast.error(err.message || "上传失败");
  });

  const handleUpload = useCallback(
    async (file: File): Promise<UploadResult | null> => {
      // Workspace-scoped upload — the attachment record gets created with
      // workspace_id but no channel/message FK. The CDN URL is what gets
      // dropped into the markdown body, which is enough for agents to
      // download via `multica attachment download <url>`. Tighter binding
      // (attachment.channel_message_id) would need a migration; if/when we
      // want lifecycle-managed cleanup we can add it later without
      // breaking this UX.
      setPendingUploads((n) => n + 1);
      try {
        return await uploadWithToast(file);
      } finally {
        setPendingUploads((n) => Math.max(0, n - 1));
      }
    },
    [uploadWithToast],
  );

  // Drag-and-drop wraps the rounded card so a drop anywhere on the input
  // surface routes the file through the editor's upload extension (same
  // handler as paste / button).
  const { isDragOver, dropZoneProps } = useFileDropZone({
    onDrop: (files) => files.forEach((f) => editorRef.current?.uploadFile(f)),
  });

  const agentMemberIds = new Set(members.filter((m) => m.member_type === "agent").map((m) => m.member_id));
  const channelAgents = agents.filter((a) => agentMemberIds.has(a.id) && !a.archived_at);

  const handleSend = useCallback(async () => {
    const trimmed = (editorRef.current?.getMarkdown() ?? "").replace(/(\n\s*)+$/, "").trim();
    if (!trimmed || disabled) return;
    // Block send while uploads are in-flight, just like main chat. Without
    // this, the URL inserted by the upload extension might land in the
    // markdown AFTER we've already submitted, leaving the receiver with a
    // message that references a half-uploaded file.
    if (editorRef.current?.hasActiveUploads()) {
      return;
    }

    let opts: ComposerSendOptions | undefined;
    if (targetMode === "none") {
      opts = { triggerMode: "none" };
    } else if (targetMode === "auto") {
      opts = { triggerMode: "auto" };
    } else if (targetMode.startsWith("manual:")) {
      const agentId = targetMode.slice("manual:".length);
      opts = { triggerMode: "manual", targets: [{ kind: "agent", id: agentId }] };
    }
    if (draftIdRef.current === null) {
      draftIdRef.current = mintClientMessageId();
    }
    const cid = draftIdRef.current;
    if (opts) opts.clientMessageId = cid;
    else opts = { clientMessageId: cid };

    try {
      await Promise.resolve(onSend(trimmed, opts));
      // Success: clear the draft and rotate the id for the next message.
      editorRef.current?.clearContent();
      editorRef.current?.blur();
      clearInputDraft(draftKey);
      draftIdRef.current = null;
      setIsEmpty(true);
    } catch {
      // Failure: rotate the cid but keep the draft text so the user can
      // edit and resend as a NEW message. The failed row is still in the
      // message cache with the OLD cid; the explicit "重试" button on that
      // row reads the cid from the cache, not from this composer.
      draftIdRef.current = null;
    }
  }, [disabled, onSend, targetMode, clearInputDraft, draftKey]);

  const targetLabel = (() => {
    if (targetMode === "follow") return "跟随频道";
    if (targetMode === "none") return "仅聊天";
    if (targetMode === "auto") return "全部 agent";
    if (targetMode.startsWith("manual:")) {
      const id = targetMode.slice("manual:".length);
      const a = channelAgents.find((x) => x.id === id);
      return a ? `@${a.name}` : "已指定";
    }
    return targetMode;
  })();

  return (
    <div className={density === "compact" ? "px-3 pb-3 pt-1" : "px-4 pb-4 pt-2"}>
      <div
        {...dropZoneProps}
        className="relative flex flex-col rounded-xl border border-border bg-background focus-within:ring-1 focus-within:ring-ring transition-colors"
      >
        <div className="flex-1 min-h-0 px-3 pt-2 pb-1">
          <ContentEditor
            // Remount when the channel/scope changes so Tiptap's Placeholder
            // (only read on mount) refreshes and the editor doesn't bleed
            // a previous channel's content into a new one.
            key={draftKey || "channel-composer"}
            ref={editorRef}
            defaultValue={inputDraft}
            placeholder={placeholder}
            onUpdate={(md) => {
              setIsEmpty(!md.trim());
              setInputDraft(draftKey, md);
              if (md.length > 0 && draftIdRef.current === null) {
                draftIdRef.current = mintClientMessageId();
              } else if (md.length === 0) {
                draftIdRef.current = null;
              }
            }}
            onSubmit={handleSend}
            onUploadFile={handleUpload}
            // Channels are short-form by default — no floating bubble
            // toolbar. Agents in the channel still get rich content from
            // paste / drag-drop / explicit markdown.
            showBubbleMenu={false}
            debounceMs={100}
          />
        </div>
        <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5">
          {/* Left side: target picker (B1). */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="px-1.5 py-0.5 rounded hover:bg-muted/60 inline-flex items-center gap-1 text-[10px] text-foreground/80"
              title="选择本条消息的目标"
            >
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">交给</span>
              <span className="font-medium">{targetLabel}</span>
              <ChevronDown className="size-3" />
            </button>
            {pickerOpen && (
              <div className="absolute bottom-full mb-1 left-0 z-10 min-w-[160px] border border-border rounded-md bg-background shadow-md py-1 text-[11px]">
                <ComposerPickerItem label="跟随频道（默认）" hint="按频道规则" active={targetMode === "follow"} onClick={() => { setTargetMode("follow"); setPickerOpen(false); }} />
                <ComposerPickerItem label="仅聊天，不触发 agent" active={targetMode === "none"} onClick={() => { setTargetMode("none"); setPickerOpen(false); }} />
                <ComposerPickerItem label="全部 agent（auto）" active={targetMode === "auto"} onClick={() => { setTargetMode("auto"); setPickerOpen(false); }} />
                {channelAgents.length > 0 && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <div className="px-2 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">指定一个 agent</div>
                    {channelAgents.map((a) => (
                      <ComposerPickerItem
                        key={a.id}
                        label={`@${a.name}`}
                        active={targetMode === `manual:${a.id}`}
                        onClick={() => { setTargetMode(`manual:${a.id}`); setPickerOpen(false); }}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          {/* Right side: file upload + send/stop. */}
          <div className="flex items-center gap-1">
            <FileUploadButton
              size="sm"
              onSelect={(file) => editorRef.current?.uploadFile(file)}
            />
            <SubmitButton
              onClick={handleSend}
              disabled={isEmpty || !!disabled || pendingUploads > 0}
              running={isRunning}
              onStop={onStop}
              tooltip="发送 (Mod+Enter)"
              stopTooltip="停止"
            />
          </div>
        </div>
        {isDragOver && <FileDropOverlay />}
      </div>
    </div>
  );
}

function ComposerPickerItem({ label, hint, active, onClick }: { label: string; hint?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-2 py-1 hover:bg-muted/60 flex items-center justify-between gap-2",
        active && "bg-muted/40 font-medium",
      )}
    >
      <span>{label}</span>
      {hint && <span className="text-muted-foreground text-[9px]">{hint}</span>}
    </button>
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
  agents = [],
  wsMembers = [],
  fullWidth = false,
}: {
  parentId: string;
  channelId: string;
  currentUserId?: string;
  onClose: () => void;
  agents?: import("@multica/core/types").Agent[];
  wsMembers?: import("@multica/core/types").MemberWithUser[];
  fullWidth?: boolean;
}) {
  const { data: replies = [] } = useQuery(channelThreadOptions(parentId));
  const sendMessage = useSendChannelMessage();

  return (
    <div
      className={cn(
        "flex flex-col shrink-0 border-l border-border",
        fullWidth ? "flex-1 border-l-0" : "w-[320px]",
      )}
    >
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
            onThreadClick={() => {}}
            isThreadActive={false}
            agents={agents}
            wsMembers={wsMembers}
            onRetry={(failed) => {
              if (!failed.client_message_id) return;
              sendMessage.mutate({
                channelId: failed.channel_id,
                content: failed.content,
                threadParentId: failed.thread_parent_id,
                clientMessageId: failed.client_message_id,
                senderId: currentUserId,
              });
            }}
          />
        ))}
        {replies.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">暂无回复</p>
        )}
      </div>
      <MessageComposer
        onSend={async (content, opts) =>
          sendMessage.mutateAsync({
            channelId,
            content,
            threadParentId: parentId,
            triggerMode: opts?.triggerMode,
            targets: opts?.targets,
            clientMessageId: opts?.clientMessageId,
            senderId: currentUserId,
          })
        }
        disabled={sendMessage.isPending}
        placeholder="回复..."
        density="compact"
        // Thread drafts are scoped per-parent so a half-typed reply in
        // one thread doesn't leak into the main channel composer when the
        // user closes the thread panel.
        draftScope={`thread:${parentId}`}
      />
    </div>
  );
}
