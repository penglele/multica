-- name: CreateChannel :one
INSERT INTO channel (workspace_id, name, description, type, created_by)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetChannel :one
SELECT * FROM channel WHERE id = $1;

-- name: GetChannelInWorkspace :one
SELECT * FROM channel WHERE id = $1 AND workspace_id = $2;

-- name: ListChannels :many
-- Returns each channel the user can access, plus their per-channel read
-- state (last_read_seq, latest_seq, unread_count). The unread_count excludes
-- the requesting user's own messages so sending a message doesn't make the
-- channel look unread to them. We exclude thread replies so unread is
-- computed against the main message stream only.
SELECT
  c.*,
  COALESCE(crs.last_read_seq, 0)::bigint AS last_read_seq,
  COALESCE((
    SELECT MAX(seq)
    FROM channel_message
    WHERE channel_id = c.id AND thread_parent_id IS NULL
  ), 0)::bigint AS latest_seq,
  COALESCE((
    SELECT COUNT(*)
    FROM channel_message m
    WHERE m.channel_id = c.id
      AND m.thread_parent_id IS NULL
      AND m.seq > COALESCE(crs.last_read_seq, 0)
      AND m.sender_id <> sqlc.arg('user_id')
  ), 0)::int AS unread_count
FROM channel c
LEFT JOIN channel_read_state crs
  ON crs.channel_id = c.id AND crs.user_id = sqlc.arg('user_id')
WHERE c.workspace_id = sqlc.arg('workspace_id')
  AND (
    c.type = 'public'
    OR EXISTS (
      SELECT 1 FROM channel_member cm
      WHERE cm.channel_id = c.id AND cm.member_id = sqlc.arg('user_id')
    )
  )
ORDER BY c.name ASC;

-- name: UpdateChannel :one
UPDATE channel
SET name = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description),
    auto_reply = COALESCE(sqlc.narg('auto_reply'), auto_reply),
    max_agent_turns = COALESCE(sqlc.narg('max_agent_turns'), max_agent_turns),
    auto_reply_strategy = COALESCE(sqlc.narg('auto_reply_strategy'), auto_reply_strategy),
    default_target_id = COALESCE(sqlc.narg('default_target_id'), default_target_id),
    updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: ClearChannelDefaultTarget :exec
-- Explicitly nulls default_target_id. UpdateChannel can't do this because
-- it uses COALESCE-on-narg semantics ("nil = no change"); clearing requires
-- a dedicated query that always sets NULL.
UPDATE channel SET default_target_id = NULL WHERE id = $1;

-- name: DeleteChannel :exec
DELETE FROM channel WHERE id = $1;

-- name: AddChannelMember :exec
INSERT INTO channel_member (channel_id, member_id, member_type, role)
VALUES ($1, $2, $3, $4)
ON CONFLICT (channel_id, member_id) DO NOTHING;

-- name: RemoveChannelMember :exec
DELETE FROM channel_member WHERE channel_id = $1 AND member_id = $2;

-- name: ListChannelMembers :many
SELECT * FROM channel_member WHERE channel_id = $1;

-- name: GetChannelMember :one
SELECT * FROM channel_member WHERE channel_id = $1 AND member_id = $2;

-- name: ListChannelAgentMembers :many
SELECT member_id FROM channel_member
WHERE channel_id = $1 AND member_type = 'agent';

-- name: CreateChannelMessage :one
INSERT INTO channel_message (channel_id, sender_id, sender_type, content, thread_parent_id, task_id, targets, client_message_id)
VALUES ($1, $2, $3, $4, sqlc.narg('thread_parent_id'), sqlc.narg('task_id'), sqlc.narg('targets'), sqlc.narg('client_message_id'))
RETURNING *;

-- name: GetChannelMessageByClientID :one
SELECT * FROM channel_message
WHERE channel_id = $1 AND client_message_id = $2
LIMIT 1;

-- name: UpdateChannelMessageTargets :one
UPDATE channel_message SET targets = $2 WHERE id = $1 RETURNING *;

-- name: GetChannelMessage :one
SELECT * FROM channel_message WHERE id = $1;

-- name: ListChannelMessages :many
-- Legacy offset-based listing. Kept for callers that haven't migrated to
-- before_seq/after_seq pagination. Returns ASC.
SELECT * FROM channel_message
WHERE channel_id = $1 AND thread_parent_id IS NULL
ORDER BY seq ASC
LIMIT $2 OFFSET $3;

-- name: ListChannelMessagesBeforeSeq :many
-- Pagination: load messages strictly older than before_seq, newest-first
-- so the handler can return the trimmed window. The handler reverses to
-- ASC for display. To get the initial "latest N" page, pass before_seq
-- equal to bigint max (or any value larger than any existing seq).
SELECT * FROM channel_message
WHERE channel_id = $1
  AND thread_parent_id IS NULL
  AND seq < $2
ORDER BY seq DESC
LIMIT $3;

-- name: ListChannelMessagesAfterSeq :many
SELECT * FROM channel_message
WHERE channel_id = $1 AND seq > $2 AND thread_parent_id IS NULL
ORDER BY seq ASC
LIMIT $3;

-- name: ListThreadReplies :many
SELECT * FROM channel_message
WHERE thread_parent_id = $1
ORDER BY created_at ASC;

-- name: CountAgentTurnsInThread :one
-- Count agent messages in a thread (including the parent) for loop prevention.
SELECT COUNT(*)::int FROM channel_message
WHERE (id = $1 OR thread_parent_id = $1)
  AND sender_type = 'agent';

-- name: UpsertChannelReadState :exec
INSERT INTO channel_read_state (channel_id, user_id, last_read_seq, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (channel_id, user_id)
DO UPDATE SET last_read_seq = GREATEST(channel_read_state.last_read_seq, EXCLUDED.last_read_seq),
              updated_at = now();

-- name: GetChannelReadState :one
SELECT * FROM channel_read_state WHERE channel_id = $1 AND user_id = $2;

-- name: CreateChannelTask :one
INSERT INTO agent_task_queue (agent_id, runtime_id, issue_id, status, priority, channel_id, channel_message_id, analysis_task_id)
VALUES ($1, $2, NULL, 'queued', $3, $4, $5, $6)
RETURNING *;
