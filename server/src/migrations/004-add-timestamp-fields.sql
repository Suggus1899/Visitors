-- Migration 004: Add timestamp lifecycle fields and IntermittentLogs table
-- Run against: Visits (SQLite)
-- Date: 2026-03-25

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add timestamp lifecycle columns to Visits
--    (SQLite: ADD COLUMN is safe; does nothing if column exists in newer SQLite)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Visits" ADD COLUMN IF NOT EXISTS arrival_time TIMESTAMP;
ALTER TABLE "Visits" ADD COLUMN IF NOT EXISTS entry_time TIMESTAMP;
ALTER TABLE "Visits" ADD COLUMN IF NOT EXISTS exit_time TIMESTAMP;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add explicit relational fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "Visits" ADD COLUMN IF NOT EXISTS target_department TEXT;
ALTER TABLE "Visits" ADD COLUMN IF NOT EXISTS host_person TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Create IntermittentLogs sub-table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "IntermittentLogs" (
    id          SERIAL PRIMARY KEY,
    visit_id    INTEGER  NOT NULL
                         REFERENCES "Visits"(id) ON DELETE CASCADE,
    check_out   TIMESTAMP NOT NULL,
    re_entry    TIMESTAMP,
    notes       TEXT,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intermittent_logs_visit_id
    ON "IntermittentLogs"(visit_id);
