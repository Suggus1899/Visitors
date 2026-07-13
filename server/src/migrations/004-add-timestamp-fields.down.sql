-- Down migration for 004: Remove timestamp fields and IntermittentLogs table
DROP INDEX IF EXISTS idx_intermittent_logs_visit_id;
DROP TABLE IF EXISTS "IntermittentLogs";
ALTER TABLE "Visits" DROP COLUMN IF EXISTS host_person;
ALTER TABLE "Visits" DROP COLUMN IF EXISTS target_department;
ALTER TABLE "Visits" DROP COLUMN IF EXISTS exit_time;
ALTER TABLE "Visits" DROP COLUMN IF EXISTS entry_time;
ALTER TABLE "Visits" DROP COLUMN IF EXISTS arrival_time;
