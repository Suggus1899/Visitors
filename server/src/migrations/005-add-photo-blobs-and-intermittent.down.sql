-- Down migration for 005: Remove photo blobs and VisitIntervals table
ALTER TABLE "IntermittentLogs" DROP COLUMN IF EXISTS registered_by;
DROP TABLE IF EXISTS "VisitIntervals";
ALTER TABLE "Visitors" DROP COLUMN IF EXISTS id_photo_data;
ALTER TABLE "Visitors" DROP COLUMN IF EXISTS photo_data;
