-- Migration 005: Add photo BLOBs to Visitors and intermittent status
-- PostgreSQL compatible

-- 1. Photo BYTEA storage in Visitors (ensures photos are backed up with DB)
ALTER TABLE "Visitors" ADD COLUMN IF NOT EXISTS photo_data BYTEA;
ALTER TABLE "Visitors" ADD COLUMN IF NOT EXISTS id_photo_data BYTEA;

-- 2. VisitIntervals table for tracking temporary exits/reentries
CREATE TABLE IF NOT EXISTS "VisitIntervals" (
  id            SERIAL PRIMARY KEY,
  visit_id      INTEGER NOT NULL REFERENCES "Visits"(id) ON DELETE CASCADE,
  exit_time     TIMESTAMP NOT NULL,
  reentry_time  TIMESTAMP,
  notes         TEXT,
  "createdAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. registered_by field in IntermittentLogs (if table exists)
ALTER TABLE "IntermittentLogs" ADD COLUMN IF NOT EXISTS registered_by TEXT;
