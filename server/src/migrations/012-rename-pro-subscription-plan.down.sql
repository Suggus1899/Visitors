BEGIN;
ALTER TABLE "Tenants" DROP CONSTRAINT IF EXISTS "Tenants_subscriptionPlan_check";
UPDATE "Tenants" SET "subscriptionPlan" = 'pro' WHERE "subscriptionPlan" = 'professional';
ALTER TABLE "Tenants" ADD CONSTRAINT "Tenants_subscriptionPlan_check" CHECK ("subscriptionPlan" IN ('free', 'starter', 'pro', 'enterprise'));
COMMIT;
