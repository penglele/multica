-- Store resolved targets on the message so they survive page refresh.
-- targets is a JSONB array of {kind, id, name, task_id, status} objects.
ALTER TABLE channel_message ADD COLUMN targets JSONB NOT NULL DEFAULT '[]';
