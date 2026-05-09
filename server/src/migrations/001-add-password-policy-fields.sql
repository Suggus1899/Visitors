-- Migration: Add password policy fields to Users table
-- Requirements: 5.1, 5.2
-- Date: 2026-02-28

-- Add mustChangePassword field (default: true for new users)
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN DEFAULT TRUE;

-- Add passwordChangedAt field to track last password change
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP NULL;

-- Update existing users to require password change
UPDATE "Users" SET "mustChangePassword" = TRUE WHERE "mustChangePassword" IS NULL;
