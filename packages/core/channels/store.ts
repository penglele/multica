import { create } from "zustand";

interface ChannelState {
  activeChannelId: string | null;
  isOpen: boolean;
  openThreadId: string | null; // message ID whose thread is expanded

  setActiveChannel: (id: string | null) => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  openThread: (messageId: string) => void;
  closeThread: () => void;
}

export const useChannelStore = create<ChannelState>((set) => ({
  activeChannelId: null,
  isOpen: false,
  openThreadId: null,

  setActiveChannel: (id) => set({ activeChannelId: id }),
  setOpen: (open) => set({ isOpen: open }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  openThread: (messageId) => set({ openThreadId: messageId }),
  closeThread: () => set({ openThreadId: null }),
}));
