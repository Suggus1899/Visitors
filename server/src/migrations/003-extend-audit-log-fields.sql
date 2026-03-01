-- Migration: Extend ActivityLogs table with additional audit fields
-- Requirements: 10.5
-- Date: 2026-02-28

-- Add HTTP method field
ALTER TABLE ActivityLogs ADD COLUMN method VARCHAR(10) NULL;

-- Add request path field
ALTER TABLE ActivityLogs ADD COLUMN path VARCHAR(255) NULL;

-- Add HTTP status code field
ALTER TABLE ActivityLogs ADD COLUMN statusCode INTEGER NULL;

-- Add request duration in milliseconds
ALTER TABLE ActivityLogs ADD COLUMN duration INTEGER NULL;

-- Add severity level for prioritization
ALTER TABLE ActivityLogs ADD COLUMN severity VARCHAR(20) DEFAULT 'low';

-- Add role field for better audit context
ALTER TABLE ActivityLogs ADD COLUMN role VARCHAR(20) NULL;

-- Add resource and resourceId for better tracking
ALTER TABLE ActivityLogs ADD COLUMN resource VARCHAR(50) NULL;
ALTER TABLE ActivityLogs ADD COLUMN resourceId INTEGER NULL;

-- Add status field (success/failure)
ALTER TABLE ActivityLogs ADD COLUMN status VARCHAR(20) DEFAULT 'success';
