-- Migration: Add account lockout fields to Users table
-- Requirements: 9.1, 9.2
-- Date: 2026-02-28

-- Add loginAttempts field to track failed login attempts
ALTER TABLE Users ADD COLUMN loginAttempts INTEGER DEFAULT 0;

-- Add lockedUntil field to track account lockout expiration
ALTER TABLE Users ADD COLUMN lockedUntil DATETIME NULL;

-- Initialize existing users with default values
UPDATE Users SET loginAttempts = 0 WHERE loginAttempts IS NULL;
