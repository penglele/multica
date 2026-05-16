"use client";

import { use } from "react";
import { ChannelDetailPage } from "@multica/views/channels";

export default function Page({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = use(params);
  return <ChannelDetailPage channelId={channelId} />;
}
