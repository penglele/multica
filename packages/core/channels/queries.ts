import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const channelKeys = {
  all: (wsId: string) => ["channels", wsId] as const,
  list: (wsId: string) => [...channelKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) => [...channelKeys.all(wsId), "detail", id] as const,
  messages: (channelId: string) => ["channel-messages", channelId] as const,
  thread: (parentId: string) => ["channel-thread", parentId] as const,
  members: (channelId: string) => ["channel-members", channelId] as const,
};

export function channelListOptions(wsId: string) {
  return queryOptions({
    queryKey: channelKeys.list(wsId),
    queryFn: () => api.listChannels(),
    staleTime: Infinity,
  });
}

export function channelDetailOptions(wsId: string, channelId: string) {
  return queryOptions({
    queryKey: channelKeys.detail(wsId, channelId),
    queryFn: () => api.getChannel(channelId),
    enabled: !!channelId,
    staleTime: Infinity,
  });
}

export function channelMessagesOptions(channelId: string) {
  return queryOptions({
    queryKey: channelKeys.messages(channelId),
    queryFn: () => api.listChannelMessages(channelId),
    enabled: !!channelId,
    staleTime: Infinity,
  });
}

export function channelThreadOptions(parentId: string) {
  return queryOptions({
    queryKey: channelKeys.thread(parentId),
    queryFn: () => api.listThreadReplies(parentId),
    enabled: !!parentId,
    staleTime: Infinity,
  });
}

export function channelMembersOptions(channelId: string) {
  return queryOptions({
    queryKey: channelKeys.members(channelId),
    queryFn: () => api.listChannelMembers(channelId),
    enabled: !!channelId,
    staleTime: Infinity,
  });
}
