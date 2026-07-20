BEGIN;

CREATE TABLE IF NOT EXISTS "Tenants" (
  "id" SERIAL PRIMARY KEY,
  "slug" VARCHAR(100) NOT NULL UNIQUE,
  "name" VARCHAR(200) NOT NULL,
  "domain" VARCHAR(255) UNIQUE,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active', 'suspended', 'trial')),
  "subscriptionPlan" VARCHAR(20) NOT NULL DEFAULT 'free' CHECK ("subscriptionPlan" IN ('free', 'starter', 'pro', 'enterprise')),
  "maxUsers" INTEGER NOT NULL DEFAULT 5,
  "maxVisitors" INTEGER NOT NULL DEFAULT 1000,
  "subscriptionExpiresAt" TIMESTAMPTZ,
  "isDemo" BOOLEAN NOT NULL DEFAULT FALSE,
  "demoExpiresAt" TIMESTAMPTZ,
  "settings" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "TenantUsers" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
  "tenantId" INTEGER NOT NULL REFERENCES "Tenants"("id") ON DELETE CASCADE,
  "role" VARCHAR(20) NOT NULL DEFAULT 'operador' CHECK ("role" IN ('admin', 'operador', 'auditor', 'demo')),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("userId", "tenantId")
);

ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "email" VARCHAR(255);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "Users" ("email") WHERE "email" IS NOT NULL;

ALTER TABLE "Visitors" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER REFERENCES "Tenants"("id");
ALTER TABLE "Visits" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER REFERENCES "Tenants"("id");
ALTER TABLE "IntermittentLogs" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER REFERENCES "Tenants"("id");
ALTER TABLE "ActivityLogs" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER REFERENCES "Tenants"("id");
ALTER TABLE "ArcoRequests" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER REFERENCES "Tenants"("id");
ALTER TABLE "VisitorEditHistories" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER REFERENCES "Tenants"("id");
ALTER TABLE "VisitPurposes" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER REFERENCES "Tenants"("id");
ALTER TABLE "Departments" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER REFERENCES "Tenants"("id");

ALTER TABLE "Visitors" DROP CONSTRAINT IF EXISTS "Visitors_cedula_key";
CREATE UNIQUE INDEX IF NOT EXISTS "visitors_tenant_cedula_unique" ON "Visitors" ("tenantId", "cedula");
CREATE INDEX IF NOT EXISTS "visitors_tenant_id_idx" ON "Visitors" ("tenantId");
CREATE INDEX IF NOT EXISTS "visits_tenant_id_idx" ON "Visits" ("tenantId");
CREATE INDEX IF NOT EXISTS "intermittent_logs_tenant_id_idx" ON "IntermittentLogs" ("tenantId");
CREATE INDEX IF NOT EXISTS "activity_logs_tenant_id_idx" ON "ActivityLogs" ("tenantId");
CREATE INDEX IF NOT EXISTS "arco_requests_tenant_id_idx" ON "ArcoRequests" ("tenantId");
CREATE INDEX IF NOT EXISTS "visitor_edit_histories_tenant_id_idx" ON "VisitorEditHistories" ("tenantId");
CREATE INDEX IF NOT EXISTS "visit_purposes_tenant_id_idx" ON "VisitPurposes" ("tenantId");
CREATE INDEX IF NOT EXISTS "departments_tenant_id_idx" ON "Departments" ("tenantId");

COMMIT;
