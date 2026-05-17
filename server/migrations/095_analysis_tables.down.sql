-- Reverse of 095_analysis_tables.up.sql. Drop in reverse FK order so
-- nothing complains about dependents.
DROP TABLE IF EXISTS analysis_audit_event;
DROP TABLE IF EXISTS analysis_artifact;
DROP TABLE IF EXISTS analysis_task;
