-- Down migration for 006: Remove visitor enhancements and lookup tables
DROP INDEX IF EXISTS idx_visitors_cedula_unique;
DROP TABLE IF EXISTS "Departments";
DROP TABLE IF EXISTS "VisitPurposes";
ALTER TABLE "Visitors" DROP COLUMN IF EXISTS "createdAt";
ALTER TABLE "Visitors" DROP COLUMN IF EXISTS observations;
ALTER TABLE "Visitors" DROP COLUMN IF EXISTS "isBlocked";
