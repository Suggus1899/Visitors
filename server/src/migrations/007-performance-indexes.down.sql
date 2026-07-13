-- Down migration for 007: Remove performance indexes
DROP INDEX IF EXISTS idx_visit_intervals_visit_id;
DROP INDEX IF EXISTS idx_visitors_company;
DROP INDEX IF EXISTS idx_activity_logs_action;
DROP INDEX IF EXISTS idx_activity_logs_username;
DROP INDEX IF EXISTS idx_activity_logs_created_at;
DROP INDEX IF EXISTS idx_visits_check_out_time;
DROP INDEX IF EXISTS idx_visits_check_in_time;
DROP INDEX IF EXISTS idx_visits_status;
DROP INDEX IF EXISTS idx_visits_visitor_cedula;
