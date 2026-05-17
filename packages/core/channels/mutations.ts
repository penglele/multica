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
  return useMutation({
    mutationFn: ({ channelId, lastReadSeq }: { channelId: string; lastReadSeq: number }) =>
      api.markChannelRead(channelId, lastReadSeq),
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
