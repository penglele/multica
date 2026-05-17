-- Add client_message_id for idempotent send (B1).
-- Used to dedup retries on flaky network. Nullable because old/agent
-- messages won't have one. Unique per channel when present so a
-- retried send doesn't create a duplicate row.
ALTER TABLE channel_message ADD COLUMN client_message_id TEXT;
CREATE UNIQUE INDEX idx_channel_message_client_id
    ON channel_message (channel_id, client_message_id)
    WHERE client_message_id IS NOT NULL;
