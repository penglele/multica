-- B2: structured auto-reply strategy.
-- auto_reply_strategy decides who fires when auto_reply is on.
--   all_agents      — every agent member of the channel responds (current B1 behaviour, kept as default).
--   default_agent   — only the agent named by default_target_id responds.
-- default_target_id is required when strategy = 'default_agent', otherwise NULL.
ALTER TABLE channel
    ADD COLUMN auto_reply_strategy TEXT NOT NULL DEFAULT 'all_agents'
        CHECK (auto_reply_strategy IN ('all_agents', 'default_agent')),
    ADD COLUMN default_target_id UUID;
