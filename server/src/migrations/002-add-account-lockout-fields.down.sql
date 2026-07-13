-- Down migration for 002: Remove account lockout fields from Users
ALTER TABLE "Users" DROP COLUMN IF EXISTS "loginAttempts";
ALTER TABLE "Users" DROP COLUMN IF EXISTS "lockedUntil";
