DROP INDEX IF EXISTS idx_channel_message_client_id;
ALTER TABLE channel_message DROP COLUMN IF EXISTS client_message_id;
