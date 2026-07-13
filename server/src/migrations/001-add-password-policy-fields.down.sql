-- Down migration for 001: Remove password policy fields from Users
ALTER TABLE "Users" DROP COLUMN IF EXISTS "mustChangePassword";
ALTER TABLE "Users" DROP COLUMN IF EXISTS "passwordChangedAt";
