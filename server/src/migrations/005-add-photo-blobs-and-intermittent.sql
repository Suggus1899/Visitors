-- Migration 005: Add photo BLOBs to Visitors and intermittent status to Visits
-- Created: 2026-04-23

-- 1. Photo BLOB storage in Visitors (ensures photos are backed up with DB)
ALTER TABLE Visitors ADD COLUMN photo_data BLOB;
ALTER TABLE Visitors ADD COLUMN id_photo_data BLOB;

-- 2. registered_by field in IntermittentLogs
ALTER TABLE IntermittentLogs ADD COLUMN registered_by TEXT;

-- Note: SQLite ENUM changes for 'intermittent' status are handled by Sequelize sync
-- since SQLite doesn't enforce ENUM constraints at the database level.
