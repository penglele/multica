-- Channel chat: multi-user channels where humans and agents collaborate.

-- channel: a named room within a workspace.
CREATE TABLE channel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'public' CHECK (type IN ('public', 'private', 'dm')),
    created_by UUID NOT NULL REFERENCES "user"(id),
    -- auto_reply: when true, any human message triggers the default agents
    -- without requiring an @mention. Leader-only toggle.
    auto_reply BOOLEAN NOT NULL DEFAULT false,
    -- max_agent_turns: per-thread cap on consecutive agent messages (loop guard).
    max_agent_turns INT NOT NULL DEFAULT 20,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(workspace_id, name)
);

CREATE INDEX idx_channel_workspace ON channel(workspace_id);

-- channel_member: who is in a channel (human or agent).
CREATE TABLE channel_member (
    channel_id UUID NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    member_id UUID NOT NULL,
    member_type TEXT NOT NULL CHECK (member_type IN ('human', 'agent')),
    -- role: owner can toggle auto_reply and manage members.
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, member_id)
);

-- channel_message: messages in a channel.
CREATE TABLE channel_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('human', 'agent', 'system')),
    content TEXT NOT NULL,
    -- seq: monotonically increasing per channel, used for read-state tracking.
    seq BIGINT NOT NULL DEFAULT 0,
    -- thread_parent_id: non-null for replies; only one level of threading.
    thread_parent_id UUID REFERENCES channel_message(id) ON DELETE CASCADE,
    -- task_id: set when this message was produced by an agent task.
    task_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assign per-channel sequential number on insert.
CREATE OR REPLACE FUNCTION assign_channel_message_seq()
RETURNS TRIGGER AS $$
BEGIN
    SELECT COALESCE(MAX(seq), 0) + 1 INTO NEW.seq
    FROM channel_message WHERE channel_id = NEW.channel_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_channel_message_seq
BEFORE INSERT ON channel_message
FOR EACH ROW EXECUTE FUNCTION assign_channel_message_seq();

CREATE INDEX idx_channel_message_channel_seq ON channel_message(channel_id, seq DESC);
CREATE INDEX idx_channel_message_thread ON channel_message(thread_parent_id, created_at ASC);

-- channel_read_state: tracks the last-read seq per user per channel.
CREATE TABLE channel_read_state (
    channel_id UUID NOT NULL REFERENCES channel(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    last_read_seq BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel_id, user_id)
);

-- Extend agent_task_queue to support channel tasks.
ALTER TABLE agent_task_queue
    ADD COLUMN channel_id UUID REFERENCES channel(id) ON DELETE SET NULL,
    ADD COLUMN channel_message_id UUID REFERENCES channel_message(id) ON DELETE SET NULL;
