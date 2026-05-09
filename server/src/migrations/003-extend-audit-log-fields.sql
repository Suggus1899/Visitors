-- Migration: Extend ActivityLogs table with additional audit fields
-- Requirements: 10.5
-- Date: 2026-02-28

-- Add HTTP method field
ALTER TABLE "ActivityLogs" ADD COLUMN IF NOT EXISTS method VARCHAR(10) NULL;

-- Add request path field
ALTER TABLE "ActivityLogs" ADD COLUMN IF NOT EXISTS path VARCHAR(255) NULL;

-- Add HTTP status code field
ALTER TABLE "ActivityLogs" ADD COLUMN IF NOT EXISTS "statusCode" INTEGER NULL;

-- Add request duration in milliseconds
ALTER TABLE "ActivityLogs" ADD COLUMN IF NOT EXISTS duration INTEGER NULL;

-- Add severity level for prioritization
ALTER TABLE "ActivityLogs" ADD COLUMN IF NOT EXISTS severity VARCHAR(20) DEFAULT 'low';

-- Add role field for better audit context
ALTER TABLE "ActivityLogs" ADD COLUMN IF NOT EXISTS role VARCHAR(20) NULL;

-- Add resource and resourceId for better tracking
ALTER TABLE "ActivityLogs" ADD COLUMN IF NOT EXISTS resource VARCHAR(50) NULL;
ALTER TABLE "ActivityLogs" ADD COLUMN IF NOT EXISTS "resourceId" INTEGER NULL;

-- Add status field (success/failure)
ALTER TABLE "ActivityLogs" ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'success';
