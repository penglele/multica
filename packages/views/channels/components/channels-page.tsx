"use client";

import { Hash } from "lucide-react";

export function ChannelsPage() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <div className="text-center space-y-2">
        <Hash className="size-8 mx-auto opacity-30" />
        <p className="text-sm">从左侧选择一个频道开始聊天</p>
      </div>
    </div>
  );
}
