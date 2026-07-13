-- Migration 008: Unify intermittent tables - drop VisitIntervals (use IntermittentLogs only)
-- VisitIntervals is superseded by IntermittentLogs which has the same structure plus registered_by

-- Drop VisitIntervals index
DROP INDEX IF EXISTS idx_visit_intervals_visit_id;

-- Drop VisitIntervals table (data was already being written to IntermittentLogs by the application)
DROP TABLE IF EXISTS "VisitIntervals";
