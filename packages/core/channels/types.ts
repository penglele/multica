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
  /** B2 routing strategy. */
  auto_reply_strategy?: "all_agents" | "default_agent";
  /** B2 default target id (only relevant when strategy === "default_agent"). */
  default_target_id?: string;
  /**
   * C2 read state, populated only by the channel listing endpoint where the
   * server knows the requesting user. Per-channel get/update returns leave
   * them undefined; treat undefined as "not loaded yet" rather than zero.
   */
  unread_count?: number;
  last_read_seq?: number;
  latest_seq?: number;
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
  client_message_id?: string;
  created_at: string;
  updated_at: string;
  /** B0 minimal feedback: who this message was routed to, and their current status. */
  targets?: ChannelMessageTarget[];
  /**
   * C1 client-only state. Server never writes this — it's a UI overlay so we
   * can render optimistic / failed / retrying states between user click and
   * server ack. Default for messages loaded from the server is "sent".
   */
  delivery_status?: "sending" | "sent" | "failed";
  /** Set when delivery_status === "failed"; surface as a tooltip / inline note. */
  error_message?: string;
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
  client_message_id?: string;
  trigger_mode?: "none" | "manual" | "auto";
  targets?: { kind: "agent"; id: string }[];
}
