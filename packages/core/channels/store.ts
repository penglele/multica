import { create } from "zustand";

interface ChannelState {
  activeChannelId: string | null;
  isOpen: boolean;
  openThreadId: string | null; // message ID whose thread is expanded

  /**
   * Compose drafts keyed by composer scope. The main channel feed uses
   * `<channelId>` as the key; thread composers use `thread:<parentMessageId>`
   * so a draft in a thread doesn't leak into the main channel and vice
   * versa. Cleared on successful send.
   */
  inputDrafts: Record<string, string>;

  setActiveChannel: (id: string | null) => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  openThread: (messageId: string) => void;
  closeThread: () => void;
  setInputDraft: (key: string, draft: string) => void;
  clearInputDraft: (key: string) => void;
}

export const useChannelStore = create<ChannelState>((set) => ({
  activeChannelId: null,
  isOpen: false,
  openThreadId: null,
  inputDrafts: {},

  setActiveChannel: (id) => set({ activeChannelId: id }),
  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  openThread: (messageId) => set({ openThreadId: messageId }),
  closeThread: () => set({ openThreadId: null }),
  setInputDraft: (key, draft) =>
    set((s) => {
      // Drop the entry entirely when the draft is empty so the store
      // doesn't accumulate stale keys for every channel ever opened.
      if (!draft) {
        if (!(key in s.inputDrafts)) return s;
        const { [key]: _drop, ...rest } = s.inputDrafts;
        return { inputDrafts: rest };
      }
      return { inputDrafts: { ...s.inputDrafts, [key]: draft } };
    }),
  clearInputDraft: (key) =>
    set((s) => {
      if (!(key in s.inputDrafts)) return s;
      const { [key]: _drop, ...rest } = s.inputDrafts;
      return { inputDrafts: rest };
    }),
}));
