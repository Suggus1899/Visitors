BEGIN;
INSERT INTO "Tenants" ("slug", "name", "status", "subscriptionPlan", "maxUsers", "maxVisitors", "settings")
VALUES ('default', 'Default Tenant', 'active', 'enterprise', 1000, 1000000, '{}'::jsonb)
ON CONFLICT ("slug") DO NOTHING;

UPDATE "Visitors" SET "tenantId" = (SELECT id FROM "Tenants" WHERE slug = 'default') WHERE "tenantId" IS NULL;
UPDATE "Visits" SET "tenantId" = (SELECT id FROM "Tenants" WHERE slug = 'default') WHERE "tenantId" IS NULL;
UPDATE "IntermittentLogs" SET "tenantId" = (SELECT id FROM "Tenants" WHERE slug = 'default') WHERE "tenantId" IS NULL;
UPDATE "ActivityLogs" SET "tenantId" = (SELECT id FROM "Tenants" WHERE slug = 'default') WHERE "tenantId" IS NULL;
UPDATE "ArcoRequests" SET "tenantId" = (SELECT id FROM "Tenants" WHERE slug = 'default') WHERE "tenantId" IS NULL;
UPDATE "VisitorEditHistories" SET "tenantId" = (SELECT id FROM "Tenants" WHERE slug = 'default') WHERE "tenantId" IS NULL;
UPDATE "VisitPurposes" SET "tenantId" = (SELECT id FROM "Tenants" WHERE slug = 'default') WHERE "tenantId" IS NULL;
UPDATE "Departments" SET "tenantId" = (SELECT id FROM "Tenants" WHERE slug = 'default') WHERE "tenantId" IS NULL;

INSERT INTO "TenantUsers" ("userId", "tenantId", "role")
SELECT u.id, t.id, CASE WHEN u.role = 'root' THEN 'admin' ELSE COALESCE(u.role, 'operador') END
FROM "Users" u CROSS JOIN "Tenants" t
WHERE t.slug = 'default' AND u.role IS NOT NULL
ON CONFLICT ("userId", "tenantId") DO NOTHING;

UPDATE "Users" SET "isSuperAdmin" = TRUE WHERE "role" = 'root';
COMMIT;
