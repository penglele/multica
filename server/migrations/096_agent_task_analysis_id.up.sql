-- P4: explicit analysis_task_id on agent_task_queue so Runner tasks
-- (and any future analysis-driven agent tasks) carry a direct FK to
-- the analysis_task they serve. This replaces the P3 pattern of
-- inferring the task from the room's default — once set, audit events
-- and result artifacts bind to the correct task even when a room has
-- multiple concurrent analyses.
ALTER TABLE agent_task_queue
    ADD COLUMN analysis_task_id UUID REFERENCES analysis_task(id) ON DELETE SET NULL;

CREATE INDEX idx_agent_task_analysis ON agent_task_queue(analysis_task_id)
    WHERE analysis_task_id IS NOT NULL;
