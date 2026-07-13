-- Migration 007: Performance indexes for common queries
-- PostgreSQL compatible

-- Visits table indexes
CREATE INDEX IF NOT EXISTS idx_visits_visitor_cedula ON "Visits"(visitor_cedula);
CREATE INDEX IF NOT EXISTS idx_visits_status ON "Visits"(status);
CREATE INDEX IF NOT EXISTS idx_visits_check_in_time ON "Visits"(check_in_time);
CREATE INDEX IF NOT EXISTS idx_visits_check_out_time ON "Visits"(check_out_time);

-- ActivityLogs indexes (used in retention cleanup and audit)
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON "ActivityLogs"("createdAt");
CREATE INDEX IF NOT EXISTS idx_activity_logs_username ON "ActivityLogs"(username);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON "ActivityLogs"(action);

-- Visitors index for lookup performance
CREATE INDEX IF NOT EXISTS idx_visitors_company ON "Visitors"(company);

-- VisitIntervals index
CREATE INDEX IF NOT EXISTS idx_visit_intervals_visit_id ON "VisitIntervals"(visit_id);
