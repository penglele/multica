ALTER TABLE channel
    DROP COLUMN IF EXISTS default_target_id,
    DROP COLUMN IF EXISTS auto_reply_strategy;
