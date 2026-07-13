-- Down migration for 003: Remove extended audit log fields
ALTER TABLE "ActivityLogs" DROP COLUMN IF EXISTS method;
ALTER TABLE "ActivityLogs" DROP COLUMN IF EXISTS path;
ALTER TABLE "ActivityLogs" DROP COLUMN IF EXISTS "statusCode";
ALTER TABLE "ActivityLogs" DROP COLUMN IF EXISTS duration;
ALTER TABLE "ActivityLogs" DROP COLUMN IF EXISTS severity;
ALTER TABLE "ActivityLogs" DROP COLUMN IF EXISTS role;
ALTER TABLE "ActivityLogs" DROP COLUMN IF EXISTS resource;
ALTER TABLE "ActivityLogs" DROP COLUMN IF EXISTS "resourceId";
ALTER TABLE "ActivityLogs" DROP COLUMN IF EXISTS status;
