ALTER TABLE agent_task_queue
    DROP COLUMN IF EXISTS channel_message_id,
    DROP COLUMN IF EXISTS channel_id;

DROP TRIGGER IF EXISTS trg_channel_message_seq ON channel_message;
DROP FUNCTION IF EXISTS assign_channel_message_seq();
DROP TABLE IF EXISTS channel_read_state;
DROP TABLE IF EXISTS channel_message;
DROP TABLE IF EXISTS channel_member;
DROP TABLE IF EXISTS channel;
