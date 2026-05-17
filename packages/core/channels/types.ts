export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  type: "public" | "private" | "dm";
  auto_reply: boolean;
  max_agent_turns: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ChannelMember {
  channel_id: string;
  member_id: string;
  member_type: "human" | "agent";
  role: "owner" | "member";
  joined_at: string;
}

export interface ChannelMessageTarget {
  kind: "agent"; // squads coming later
  id: string;
  name: string;
  task_id?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
}

export interface ChannelMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_type: "human" | "agent" | "system";
  content: string;
  seq: number;
  thread_parent_id?: string;
  task_id?: string;
  created_at: string;
  updated_at: string;
  /** B0 minimal feedback: who this message was routed to, and their current status. */
  targets?: ChannelMessageTarget[];
}

export interface ChannelTargetUpdatePayload {
  channel_id: string;
  channel_message_id: string;
  task_id: string;
  target_kind: "agent";
  target_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
}

export interface CreateChannelRequest {
  name: string;
  description?: string;
  type?: "public" | "private" | "dm";
}

export interface UpdateChannelRequest {
  name?: string;
  description?: string;
  auto_reply?: boolean;
  max_agent_turns?: number;
}

export interface SendChannelMessageRequest {
  content: string;
  thread_parent_id?: string;
}
