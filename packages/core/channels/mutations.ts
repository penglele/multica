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

export function useSendChannelMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, content, threadParentId }: { channelId: string; content: string; threadParentId?: string }) =>
      api.sendChannelMessage(channelId, content, threadParentId),
    onSuccess: (msg: ChannelMessage) => {
      // Append to cache, deduping on id — the WS channel:message event will
      // also fire (we broadcast on send), so without this guard we'd insert
      // the same message twice.
      qc.setQueryData<ChannelMessage[]>(channelKeys.messages(msg.channel_id), (old = []) => {
        if (old.some((m) => m.id === msg.id)) return old;
        return [...old, msg];
      });
      if (msg.thread_parent_id) {
        qc.setQueryData<ChannelMessage[]>(channelKeys.thread(msg.thread_parent_id), (old = []) => {
          if (old.some((m) => m.id === msg.id)) return old;
          return [...old, msg];
        });
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
