-- Migration 004: Add timestamp lifecycle fields and IntermittentLogs table
-- Run against: Visits (SQLite)
-- Date: 2026-03-25

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add timestamp lifecycle columns to Visits
--    (SQLite: ADD COLUMN is safe; does nothing if column exists in newer SQLite)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE Visits ADD COLUMN arrival_time DATETIME;
ALTER TABLE Visits ADD COLUMN entry_time   DATETIME;
ALTER TABLE Visits ADD COLUMN exit_time    DATETIME;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add explicit relational fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE Visits ADD COLUMN target_department TEXT;
ALTER TABLE Visits ADD COLUMN host_person       TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Create IntermittentLogs sub-table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS IntermittentLogs (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    visit_id    INTEGER  NOT NULL
                         REFERENCES Visits(id) ON DELETE CASCADE,
    check_out   DATETIME NOT NULL,
    re_entry    DATETIME,
    notes       TEXT,
    createdAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_intermittent_logs_visit_id
    ON IntermittentLogs(visit_id);
