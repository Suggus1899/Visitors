-- Migration 005: Add photo BLOBs to Visitors and intermittent status + VisitIntervals table

-- 1. Add BLOB columns to Visitors (keep photo_url and id_photo_url for backward compatibility)
ALTER TABLE Visitors ADD COLUMN photo_blob BLOB;
ALTER TABLE Visitors ADD COLUMN id_photo_blob BLOB;

-- 2. VisitIntervals table for tracking temporary exits/reentries
CREATE TABLE IF NOT EXISTS VisitIntervals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id      INTEGER NOT NULL REFERENCES Visits(id) ON DELETE CASCADE,
  exit_time     DATETIME NOT NULL,
  reentry_time  DATETIME,
  notes         TEXT,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. SQLite does not support modifying ENUM inline; we update via application-level check.
--    The 'intermittent' value will be accepted by the TEXT column type already used by SQLite.
--    (Sequelize ENUM maps to TEXT in SQLite)
