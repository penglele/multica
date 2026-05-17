import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { channelKeys } from "./queries";
import type { Channel, ChannelMessage } from "./types";

export function useCreateChannel() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; type?: string }) =>
      api.createChannel(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: channelKeys.list(wsId) }),
  });
}

export function useUpdateChannel() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; auto_reply?: boolean; max_agent_turns?: number }) =>
      api.updateChannel(id, data),
    onSuccess: (ch: Channel) => {
      qc.setQueryData(channelKeys.detail(wsId, ch.id), ch);
      qc.invalidateQueries({ queryKey: channelKeys.list(wsId) });
    },
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteChannel(id),
    onSuccess: (_: void, id: string) => {
      qc.removeQueries({ queryKey: channelKeys.detail(wsId, id) });
      qc.invalidateQueries({ queryKey: channelKeys.list(wsId) });
    },
  });
}

// Stable placeholder seq value — keep it large enough to sort to the bottom
// of any reasonable real-message list, but not so large that it overflows.
// Server seqs start at 1 and increment monotonically; 2^53-1 is safely past
// anything we'd see in production.
const PLACEHOLDER_SEQ = Number.MAX_SAFE_INTEGER;

export interface SendChannelMessageVars {
  channelId: string;
  content: string;
  threadParentId?: string;
  triggerMode?: "none" | "manual" | "auto";
  targets?: { kind: "agent"; id: string }[];
  clientMessageId?: string;
  /** Sender's user id — used to render the optimistic placeholder under
   *  the right author. The mutation reads it but doesn't change it. */
  senderId?: string;
}

export function useSendChannelMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      channelId,
      content,
      threadParentId,
      triggerMode,
      targets,
      clientMessageId,
    }: SendChannelMessageVars) =>
      api.sendChannelMessage(channelId, {
        content,
        thread_parent_id: threadParentId,
        trigger_mode: triggerMode,
        targets,
        client_message_id: clientMessageId,
      }),
    // Optimistic insert: drop a sending-state placeholder into the cache
    // the instant the user clicks send, so they see their message before
    // the server roundtrip completes. Keyed by client_message_id so retries
    // hit the same row.
    onMutate: async (vars) => {
      if (!vars.clientMessageId) return;
      const placeholder: ChannelMessage = {
        id: `pending:${vars.clientMessageId}`,
        channel_id: vars.channelId,
        sender_id: vars.senderId ?? "",
        sender_type: "human",
        content: vars.content,
        seq: PLACEHOLDER_SEQ,
        thread_parent_id: vars.threadParentId,
        client_message_id: vars.clientMessageId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        targets: [],
        delivery_status: "sending",
      };
      const upsert = (old: ChannelMessage[] = []) => {
        // If a previous attempt left a failed placeholder behind, replace it
        // (so retry re-uses the same slot). Otherwise append.
        const existing = old.findIndex((m) => m.client_message_id === vars.clientMessageId);
        if (existing >= 0) {
          const next = old.slice();
          next[existing] = placeholder;
          return next;
        }
        return [...old, placeholder];
      };
      qc.setQueryData<ChannelMessage[]>(channelKeys.messages(vars.channelId), (old = []) => upsert(old));
      if (vars.threadParentId) {
        qc.setQueryData<ChannelMessage[]>(channelKeys.thread(vars.threadParentId), (old = []) => upsert(old));
      }
    },
    onSuccess: (msg: ChannelMessage, vars) => {
      // Swap the placeholder for the server row. Match by client_message_id;
      // dedup by id so the parallel WS channel:message event doesn't insert
      // a third copy.
      const real: ChannelMessage = { ...msg, delivery_status: "sent" };
      const replace = (old: ChannelMessage[] = []) => {
        const filtered = old.filter(
          (m) =>
            m.id !== `pending:${vars.clientMessageId}` &&
            m.id !== msg.id,
        );
        return [...filtered, real];
      };
      qc.setQueryData<ChannelMessage[]>(channelKeys.messages(msg.channel_id), (old = []) => replace(old));
      if (msg.thread_parent_id) {
        qc.setQueryData<ChannelMessage[]>(channelKeys.thread(msg.thread_parent_id), (old = []) => replace(old));
      }
    },
    onError: (err, vars) => {
      if (!vars.clientMessageId) return;
      const message = err instanceof Error ? err.message : String(err);
      const markFailed = (old: ChannelMessage[] = []) =>
        old.map((m) => {
          if (m.id !== `pending:${vars.clientMessageId}`) return m;
          return { ...m, delivery_status: "failed" as const, error_message: message };
        });
      qc.setQueryData<ChannelMessage[]>(channelKeys.messages(vars.channelId), (old = []) => markFailed(old));
      if (vars.threadParentId) {
        qc.setQueryData<ChannelMessage[]>(channelKeys.thread(vars.threadParentId), (old = []) => markFailed(old));
      }
    },
  });
}

export function useMarkChannelRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, lastReadSeq }: { channelId: string; lastReadSeq: number }) =>
      api.markChannelRead(channelId, lastReadSeq),
    // Patch the channel listing cache so the sidebar badge reflects the new
    // read state without waiting for a refetch. The server-side index is
    // GREATEST(existing, incoming), so we only ever advance — same here.
    onMutate: ({ channelId, lastReadSeq }) => {
      // The list cache is keyed by workspace id, but a mark-read call
      // doesn't know the workspace id directly. setQueriesData with the
      // ["channels"] prefix matches every workspace's list — there's
      // typically one in flight at a time.
      qc.setQueriesData<Channel[]>({ queryKey: ["channels"] }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.map((c) => {
          if (c.id !== channelId) return c;
          const newLastRead = Math.max(c.last_read_seq ?? 0, lastReadSeq);
          // Common case: mark-read advances to the latest seen seq, which
          // collapses unread to 0. Partial advances are rare (and resolved
          // on the next list refresh) so we just leave the count alone there.
          const newUnread = newLastRead >= (c.latest_seq ?? 0) ? 0 : c.unread_count ?? 0;
          return { ...c, last_read_seq: newLastRead, unread_count: newUnread };
        });
      });
    },
  });
}

/**
 * Loads the page of messages strictly older than the oldest currently in the
 * cache (using the server's seq cursor) and prepends them. Used by the
 * "Load earlier" button. Resolves to the count of new messages; resolving
 * to 0 means "no more history" so the UI can hide the button.
 */
export function useLoadEarlierChannelMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelId,
      pageSize = 50,
    }: {
      channelId: string;
      pageSize?: number;
    }) => {
      const existing =
        qc.getQueryData<ChannelMessage[]>(channelKeys.messages(channelId)) ?? [];
      // The cache is sorted ASC by seq; the oldest is at index 0. If the
      // cache is empty we'd be loading the latest page — which is what the
      // initial query already does — so treat empty as "nothing to load
      // earlier".
      if (existing.length === 0) return 0;
      const oldestSeq = existing[0]?.seq ?? 0;
      if (oldestSeq <= 1) return 0;
      const older = await api.listChannelMessages(channelId, {
        before_seq: oldestSeq,
        limit: pageSize,
      });
      if (older.length === 0) return 0;
      qc.setQueryData<ChannelMessage[]>(channelKeys.messages(channelId), (cur = []) => {
        // Dedup by id just in case (concurrent loads / WS overlap).
        const have = new Set(cur.map((m) => m.id));
        const merged = [...older.filter((m) => !have.has(m.id)), ...cur];
        // Preserve ASC order by seq.
        return merged.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      });
      return older.length;
    },
  });
}

export function useAddChannelMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, memberId, memberType }: { channelId: string; memberId: string; memberType: "human" | "agent" }) =>
      api.addChannelMember(channelId, memberId, memberType),
    onSuccess: (_: void, { channelId }) =>
      qc.invalidateQueries({ queryKey: channelKeys.members(channelId) }),
  });
}

export function useRemoveChannelMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, memberId }: { channelId: string; memberId: string }) =>
      api.removeChannelMember(channelId, memberId),
    onSuccess: (_: void, { channelId }) =>
      qc.invalidateQueries({ queryKey: channelKeys.members(channelId) }),
  });
}
