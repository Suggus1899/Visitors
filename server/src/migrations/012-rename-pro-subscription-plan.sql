BEGIN;
ALTER TABLE "Tenants" DROP CONSTRAINT IF EXISTS "Tenants_subscriptionPlan_check";
UPDATE "Tenants" SET "subscriptionPlan" = 'professional' WHERE "subscriptionPlan" = 'pro';
ALTER TABLE "Tenants" ADD CONSTRAINT "Tenants_subscriptionPlan_check" CHECK ("subscriptionPlan" IN ('free', 'starter', 'professional', 'enterprise'));
COMMIT;
