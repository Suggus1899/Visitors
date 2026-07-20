# API Reference

Complete REST API reference for LogMaster. The backend runs on port **3001**. All routes are prefixed with `/api` (tenant/auth) or `/platform` (superadmin). Interactive Swagger UI is available at `/api-docs` in non-production environments.

> For architecture and middleware chains see [ARCHITECTURE.md](./ARCHITECTURE.md). For security details see the Security section in [ARCHITECTURE.md](./ARCHITECTURE.md#security).

## Conventions

- **Auth**: Bearer token in `Authorization: Bearer <accessToken>`. SSE endpoints accept `?token=<accessToken>` query param.
- **Response envelope**: all JSON responses use `{ success: boolean, data?: ..., error?: { code, message, details? } }`.
- **Tenant context**: tenant-scoped routes include `:tenantSlug` in the path. The middleware chain `verifyToken → resolveTenant → verifyTenantMembership` populates `req.user.tid`, `req.user.role`, and `req.tenantId`.
- **Validation**: request bodies and queries are validated with Zod schemas (`server/src/schemas/`).
- **Rate limiting**: see [ARCHITECTURE.md](./ARCHITECTURE.md#rate-limiting) for per-endpoint limiter details.

## Route Groups

| Group                | Prefix                    | Auth middleware                                                        |
| -------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Auth                 | `/api/v1/auth/*`          | Public (rate-limited); `change-password` requires `verifyToken`        |
| Visitors             | `/api/v1/:tenantSlug/visitors/*` | `verifyToken` → `resolveTenant` → `verifyTenantMembership`     |
| Visits               | `/api/v1/:tenantSlug/visits/*`   | tenant context + `denyAuditorOnly` (mutations)                |
| Reports              | `/api/v1/:tenantSlug/reports/*`  | tenant context                                                 |
| Audit                | `/api/v1/:tenantSlug/audit/*`    | tenant context + `verifyAuditor`                                |
| Privacy / ARCO       | `/api/v1/:tenantSlug/privacy/*`  | tenant context + `verifyAuditor` / `isAdmin` / `denyAuditorOnly` |
| Backups (global)     | `/api/v1/backups/*`       | `verifyToken` + `isAdmin`                                              |
| Backups (tenant)     | `/api/v1/:tenantSlug/backups/*`  | tenant context + `isAdmin` + `subscriptionGuard('backupOnDemand')` |
| Tenant features      | `/api/v1/:tenantSlug/*`   | tenant context + feature guards                                        |
| Events (SSE)         | `/api/v1/events/visits`   | `verifySseToken`                                                       |
| Health               | `/api/v1/health`          | Public                                                                 |
| Superadmin (legacy)  | `/api/v1/superadmin/*`    | `adminLimiter` + `verifyToken` + `isSuperAdmin`                        |
| Platform             | `/platform/v1/*`          | `adminLimiter` + `verifyToken` + `isSuperAdmin`                        |

---

## Auth

### POST /api/v1/auth/login

Authenticate a user and obtain tokens.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | `authLimiter` (5 failed / 15min per IP:path; successful requests not counted) |
| **Body** | `username` (string, username or email), `password` (string) |

**200** — `{ success: true, data: { accessToken, refreshToken, user: { id, username, email, role, mustChangePassword } } }`
**401** — Invalid credentials
**429** — Rate limit exceeded

### POST /api/v1/auth/refresh

Exchange a refresh token for a new access token.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | `refreshLimiter` (30 / hour per user id encoded in token) |
| **Body** | `refreshToken` (string, required), `tenantSlug` (string, optional) |

**200** — `{ success: true, data: { accessToken } }`
**401** — Invalid or expired refresh token

### POST /api/v1/auth/forgot-password

Request a password reset token (emailed).

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | `authLimiter` |
| **Body** | `username` (string) |

**200** — `{ success: true, data: { message } }` (always returns 200 to avoid user enumeration)
**404** — User not found (in some configurations)

### POST /api/v1/auth/reset-password

Reset password using a token from the reset email.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | `authLimiter` |
| **Body** | `token` (string, required), `newPassword` (string, min 12 chars) |

**200** — `{ success: true, data: { message } }`
**400** — Invalid or expired token / password policy violation

### POST /api/v1/auth/change-password

Change the authenticated user's password.

| | |
|---|---|
| **Auth** | `verifyToken` |
| **Body** | `currentPassword` (string), `newPassword` (string, min 12 chars), `confirmPassword` (string, optional — must match `newPassword`) |

**200** — `{ success: true, data: { message } }`
**400** — Validation error / password policy violation
**401** — Invalid current password

### GET /api/v1/auth/tenants

List tenants the authenticated user belongs to.

| | |
|---|---|
| **Auth** | `verifyToken` |

**200** — `{ success: true, data: { tenants: [{ id, slug, name, role, subscriptionPlan, status }] } }`
**401** — Unauthorized

### POST /api/v1/auth/select-tenant

Select a working tenant and receive a tenant-scoped access token.

| | |
|---|---|
| **Auth** | `verifyToken` |
| **Body** | `tenantSlug` (string, required) |

**200** — `{ success: true, data: { accessToken, refreshToken, tenant: {...} } }`
**403** — Forbidden / tenant unavailable

### POST /api/v1/auth/demo

Create a self-contained demo tenant with 3 pre-provisioned users and seed data.

| | |
|---|---|
| **Auth** | None |
| **Rate limit** | `demoLimiter` (3 / hour per IP) |
| **Body** | `name` (string, required), `email` (string, required), `company` (string, optional), `phone` (string, optional) |

**201** — `{ success: true, data: { demoTenant: { slug, name, expiresAt }, credentials: [{ email, password, role }], accessToken } }`
**429** — Rate limit exceeded

> Demo users: `guardia@<slug>.com` (operador), `admin@<slug>.com` (admin), `auditor@<slug>.com` (auditor). Password: `Demo123*`. Demo lasts 7 days, plan `starter`.

---

## Visitors

All visitor routes are under `/api/v1/:tenantSlug/visitors` and require the tenant context chain.

### GET /api/v1/:tenantSlug/visitors

List visitors with pagination.

| | |
|---|---|
| **Auth** | tenant context |
| **Query** | `page` (int, default 1), `limit` (int, default 50), `company` (string, optional) |

**200** — `{ success: true, data: { visitors: [...], total, page, limit } }`

### GET /api/v1/:tenantSlug/visitors/:cedula

Get a single visitor by cedula (plaintext cedula is hashed for lookup).

| | |
|---|---|
| **Auth** | tenant context |

**200** — `{ success: true, data: { visitor: {...decrypted} } }`
**404** — Visitor not found

### PATCH /api/v1/:tenantSlug/visitors/:cedula

Update visitor information. PII fields are re-encrypted on save; changes are recorded in `VisitorEditHistory`.

| | |
|---|---|
| **Auth** | tenant context |
| **Body** | Partial visitor fields (`first_name`, `last_name`, `company`, `email`, `phone`, `job_title`, `isBlocked`, `observations`, ...) |

**200** — `{ success: true, data: { visitor: {...} } }`
**404** — Visitor not found

### POST /api/v1/:tenantSlug/visitors/verify-edit-password

Verify the edit-protection password before allowing edits to locked records.

| | |
|---|---|
| **Auth** | tenant context |
| **Body** | `{ password: string }` (compared against `EDIT_PASSWORD` env) |

**200** — `{ success: true, data: { valid: boolean } }`
**403** — Invalid password

### GET /api/v1/:tenantSlug/visitors/:cedula/photo

Stream the visitor's face photo (BLOB). Content-Type is detected from magic bytes.

| | |
|---|---|
| **Auth** | tenant context |

**200** — `image/jpeg` | `image/png` | `image/gif` (binary stream)
**404** — Photo not found

### GET /api/v1/:tenantSlug/visitors/:cedula/id-photo

Stream the visitor's ID photo (BLOB).

| | |
|---|---|
| **Auth** | tenant context |

**200** — `image/jpeg` | `image/png` | `image/gif` (binary stream)
**404** — Photo not found

### GET /api/v1/:tenantSlug/visitors/companies

List unique company names for the tenant.

| | |
|---|---|
| **Auth** | tenant context |

**200** — `{ success: true, data: { companies: string[] } }`

### GET /api/v1/:tenantSlug/visits/:visitId/edit-history

Get the edit history for a specific visit.

| | |
|---|---|
| **Auth** | tenant context |

**200** — `{ success: true, data: { edits: [{ id, field, oldValue, newValue, editedBy, editedByUsername, editedAt }] } }`

### GET /api/v1/:tenantSlug/visitors/:cedula/edit-history

Get the edit history for a specific visitor.

| | |
|---|---|
| **Auth** | tenant context |

**200** — `{ success: true, data: { edits: [...] } }`

---

## Visits

All visit routes are under `/api/v1/:tenantSlug/visits` and require the tenant context chain. Mutation routes additionally apply `denyAuditorOnly`.

### POST /api/v1/:tenantSlug/visits/checkin

Check in a visitor. Enforces subscription visit/visitor limits (`enforceCheckInLimits`).

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` + `enforceCheckInLimits` |
| **Body** | `visitorCedula` (string, required), `consent` ({ accepted: true, policyVersion, acceptedAt }, required), `purpose` (string, required), `personToVisit` (string, required), `targetDepartment` (string, required), `hostPerson` (string, required), `status` ('waiting' | 'active', optional), `notes` (optional), `arrivalTime`/`entryTime`/`exitTime` (ISO 8601, optional), `companionName`, `companionCedula`, `vehicleBrand`, `vehicleModel`, `vehiclePlate`, `area`, `action` ('Carga' | 'Descarga' | 'Ninguna'), `department`, `visitorData` ({ firstName, lastName, company, email, phone, photo, photoBase64, idPhotoBase64, jobTitle }) |

**200** — `{ success: true, data: { visit: {...} } }`
**400** — Visitor already checked in / invalid data
**403** — `VISIT_LIMIT_EXCEEDED` / `VISITOR_LIMIT_EXCEEDED`

### POST /api/v1/:tenantSlug/visits/:id/checkout

Check out a visitor (active → completed).

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |

**200** — `{ success: true, data: { visit: {...} } }`
**404** — Visit not found or already completed

### POST /api/v1/:tenantSlug/visits/:id/admit

Admit a waiting visitor (waiting → active).

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |

**200** — `{ success: true, data: { visit: {...} } }`
**404** — Visit not found or not in waiting status

### GET /api/v1/:tenantSlug/visits/active

List all active visits for the tenant.

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |

**200** — `{ success: true, data: { visits: [...] } }`

### GET /api/v1/:tenantSlug/visits/waiting

List all waiting visits.

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |

**200** — `{ success: true, data: { visits: [...] } }`

### GET /api/v1/:tenantSlug/visits/intermittent

List all intermittent visits (temporarily outside).

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |

**200** — `{ success: true, data: { visits: [...] } }`

### POST /api/v1/:tenantSlug/visits/:id/intermittent

Transition a visit to intermittent (legacy endpoint).

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |

**200** — `{ success: true, data: { visit: {...} } }`

### POST /api/v1/:tenantSlug/visits/:id/intermittent-exit

Register a temporary exit (active → intermittent).

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |
| **Body** | `notes` (string, optional) |

**200** — `{ success: true, data: { visit: {...} } }`

### POST /api/v1/:tenantSlug/visits/:id/intermittent-reentry

Register a re-entry (intermittent → active).

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |
| **Body** | `notes` (string, optional) |

**200** — `{ success: true, data: { visit: {...} } }`

### POST /api/v1/:tenantSlug/visits/:id/reactivate

Reactivate a completed visit.

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |

**200** — `{ success: true, data: { visit: {...} } }`

### GET /api/v1/:tenantSlug/visits

List visits with filters and pagination.

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |
| **Query** | `page`, `limit`, `status` ('active' | 'intermittent' | 'completed') |

**200** — `{ success: true, data: { visits: [...], total, page, limit } }`

---

## Reports

All report routes are under `/api/v1/:tenantSlug/reports` and require the tenant context chain.

### GET /api/v1/:tenantSlug/reports/stats

General visit statistics for a date range.

| | |
|---|---|
| **Auth** | tenant context |
| **Query** | `start` (date), `end` (date) |

**200** — `{ success: true, data: { stats: {...} } }`

### GET /api/v1/:tenantSlug/reports/stats/monthly

Monthly visit statistics.

| | |
|---|---|
| **Auth** | tenant context |
| **Query** | `month` (string), `year` (int) |

**200** — `{ success: true, data: { monthly: {...} } }`

### GET /api/v1/:tenantSlug/reports/alerts

Missed checkout alerts (visits still active past expected checkout).

| | |
|---|---|
| **Auth** | tenant context |

**200** — `{ success: true, data: { alerts: [...] } }`

### GET /api/v1/:tenantSlug/reports/comparison

Comparison statistics across periods.

| | |
|---|---|
| **Auth** | tenant context |
| **Query** | validated by `getComparisonStatsSchema` |

**200** — `{ success: true, data: { comparison: {...} } }`

---

## Audit

All audit routes are under `/api/v1/:tenantSlug/audit` and require the tenant context chain + `verifyAuditor` (allows auditor, admin, root).

### GET /api/v1/:tenantSlug/audit/logs

Paginated audit logs with filters.

| | |
|---|---|
| **Auth** | tenant context + `verifyAuditor` |
| **Query** | `page`, `limit`, `action`, `username`, `startDate`, `endDate` |

**200** — `{ success: true, data: { logs: [...], total, page, limit } }`

### GET /api/v1/:tenantSlug/audit/stats

Audit statistics.

| | |
|---|---|
| **Auth** | tenant context + `verifyAuditor` |

**200** — `{ success: true, data: { stats: {...} } }`

### GET /api/v1/:tenantSlug/audit/export

Export audit logs to CSV.

| | |
|---|---|
| **Auth** | tenant context + `verifyAuditor` |
| **Query** | same filters as `/logs` |

**200** — `text/csv` (file download)

### GET /api/v1/:tenantSlug/audit/actions

List distinct audit actions (for filter dropdowns).

| | |
|---|---|
| **Auth** | tenant context + `verifyAuditor` |

**200** — `{ success: true, data: { actions: string[] } }`

### GET /api/v1/:tenantSlug/audit/users

List distinct usernames present in audit logs (for filter dropdowns).

| | |
|---|---|
| **Auth** | tenant context + `verifyAuditor` |

**200** — `{ success: true, data: { users: string[] } }`

### GET /api/v1/:tenantSlug/audit/config

Get the audit retention policy configuration.

| | |
|---|---|
| **Auth** | tenant context + `verifyAuditor` |

**200** — `{ success: true, data: { retentionDays: number } }`

---

## Privacy / ARCO

All privacy routes are under `/api/v1/:tenantSlug/privacy`. ARCO = Acceso, Rectificación, Cancelación, Oposición (GDPR / Ley 25.326).

### POST /api/v1/:tenantSlug/privacy/arco-requests

Create an ARCO request.

| | |
|---|---|
| **Auth** | tenant context |
| **Body** | validated by `createArcoRequestSchema` (`requestType`, `subjectCedula`, `requestedByName`, `contactEmail`, `reason`, ...) |

**201** — `{ success: true, data: { request: {...} } }`

### GET /api/v1/:tenantSlug/privacy/arco-requests

List ARCO requests.

| | |
|---|---|
| **Auth** | tenant context + `verifyAuditor` |

**200** — `{ success: true, data: { requests: [...] } }`

### PATCH /api/v1/:tenantSlug/privacy/arco-requests/:id/status

Update an ARCO request status.

| | |
|---|---|
| **Auth** | tenant context + `verifyAuditor` |
| **Body** | validated by `updateArcoStatusSchema` (`status`, `resolutionNotes`) |

**200** — `{ success: true, data: { request: {...} } }`

### GET /api/v1/:tenantSlug/privacy/subjects/:cedula

Access a data subject's personal data (Right of Access).

| | |
|---|---|
| **Auth** | tenant context + `verifyAuditor` |

**200** — `{ success: true, data: { subject: { visitor, visits, ... } } }`

### PATCH /api/v1/:tenantSlug/privacy/subjects/:cedula

Rectify a data subject's personal data (Right of Rectification).

| | |
|---|---|
| **Auth** | tenant context + `denyAuditorOnly` |
| **Body** | validated by `rectifyDataSchema` |

**200** — `{ success: true, data: { subject: {...} } }`

### DELETE /api/v1/:tenantSlug/privacy/subjects/:cedula

Cancel / delete a data subject's personal data (Right of Cancellation).

| | |
|---|---|
| **Auth** | tenant context + `isAdmin` |

**200** — `{ success: true, data: { message } }`

### POST /api/v1/:tenantSlug/privacy/subjects/:cedula/opposition

Create an opposition request (Right of Opposition).

| | |
|---|---|
| **Auth** | tenant context |
| **Body** | validated by `oppositionSchema` |

**201** — `{ success: true, data: { request: {...} } }`

---

## Backups

### Global backups (`/api/v1/backups`)

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/v1/backups` | `verifyToken` + `isAdmin` | Create a global encrypted backup. Returns a one-time restore password. |
| GET | `/api/v1/backups` | `verifyToken` + `isAdmin` | List all backup files. |
| POST | `/api/v1/backups/:filename/restore` | `verifyToken` + `isAdmin` | Restore a backup. Body: `{ restorePassword }` (format `trebol-XXXXXXXX-NNNN`). |

### Tenant backups (`/api/v1/:tenantSlug/backups`)

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/v1/:tenantSlug/backups/schedule` | tenant context + `isAdmin` | Get the tenant's backup schedule. |
| GET | `/api/v1/:tenantSlug/backups` | tenant context + `isAdmin` | List tenant backups. |
| POST | `/api/v1/:tenantSlug/backups` | tenant context + `isAdmin` + `subscriptionGuard('backupOnDemand')` | Create a tenant backup. |
| POST | `/api/v1/:tenantSlug/backups/:filename/restore` | tenant context + `isAdmin` + `subscriptionGuard('backupOnDemand')` | Restore a tenant backup. Body: `{ restorePassword }`. |

---

## Tenant Features

Routes under `/api/v1/:tenantSlug/*` that are gated by subscription features.

### GET /api/v1/:tenantSlug/subscription

Get the tenant's current subscription plan and usage.

| | |
|---|---|
| **Auth** | tenant context |

**200** — `{ success: true, data: { plan, limits, usage } }`

### GET /api/v1/:tenantSlug/calendar/events

Get calendar events (subscription-gated: `calendar` feature).

| | |
|---|---|
| **Auth** | tenant context + `subscriptionGuard('calendar')` |

**200** — `{ success: true, data: { events: [...] } }`

### GET /api/v1/:tenantSlug/auditor/edits

Get auditor edit history (subscription-gated: `auditor` feature).

| | |
|---|---|
| **Auth** | tenant context + `subscriptionGuard('auditor')` + `verifyAuditor` |

**200** — `{ success: true, data: { edits: [...] } }`

### GET /api/v1/:tenantSlug/auditor/exports

Export auditor data (subscription-gated: `auditor` feature).

| | |
|---|---|
| **Auth** | tenant context + `subscriptionGuard('auditor')` + `verifyAuditor` |

**200** — File download (CSV/Excel)

### GET /api/v1/:tenantSlug/auditor/stats

Get auditor statistics (subscription-gated: `auditor` feature).

| | |
|---|---|
| **Auth** | tenant context + `subscriptionGuard('auditor')` + `verifyAuditor` |

**200** — `{ success: true, data: { stats: {...} } }`

---

## Events (SSE)

### GET /api/v1/events/visits

Server-Sent Events stream for real-time visit updates.

| | |
|---|---|
| **Auth** | `verifySseToken` (token via `?token=` query param) |
| **Response** | `text/event-stream` |

Events are JSON objects with a `type` and `tenantId`. The server filters events so a client only receives events for its own tenant. A `:heartbeat` comment is sent every 25 seconds. System events (e.g. `system:connected`) have no `tenantId` and are always delivered.

---

## Health

### GET /api/v1/health

Healthcheck (exempt from rate limiting).

| | |
|---|---|
| **Auth** | None |

**200** (healthy) / **503** (unhealthy) — `{ status, service: 'logmaster-api', version, uptime, database: boolean, jwt: boolean, timestamp }`

---

## Superadmin (legacy)

Routes under `/api/v1/superadmin/*` — guarded by `adminLimiter` + `verifyToken` + `isSuperAdmin`.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/v1/superadmin/users` | List all users |
| POST | `/api/v1/superadmin/users` | Create a user (body: `createUserSchema`) |
| PUT | `/api/v1/superadmin/users/:id` | Update a user (body: `updateUserSchema`) |
| DELETE | `/api/v1/superadmin/users/:id` | Delete a user |
| POST | `/api/v1/superadmin/users/:id/reset-password` | Reset a user's password (body: `resetUserPasswordSchema`) |
| GET | `/api/v1/superadmin/audit-logs` | Get audit logs filtered by user id |

---

## Platform (Superadmin)

All platform routes are under `/platform/v1/*` and require `adminLimiter` + `verifyToken` + `isSuperAdmin` (`role === 'root'`).

### Tenants

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/platform/v1/tenants` | List tenants (query: `page`, `pageSize`, `status`, `plan`, `isDemo`, `search`, `sortBy`, `order`) |
| POST | `/platform/v1/tenants` | Create a tenant (body: `name`, `slug`, `plan?`, `isDemo?`, `demoExpiresAt?`, `subscriptionExpiresAt?`, `maxUsers?`, `maxVisitors?`) |
| GET | `/platform/v1/tenants/:id` | Get a tenant |
| GET | `/platform/v1/tenants/:id/usage` | Get tenant usage (visits, visitors, users by role) |
| PATCH | `/platform/v1/tenants/:id` | Update a tenant |
| POST | `/platform/v1/tenants/:id/suspend` | Suspend a tenant |
| POST | `/platform/v1/tenants/:id/activate` | Activate a tenant |
| DELETE | `/platform/v1/tenants/:id` | Delete a tenant (cascade) |

### Tenant Users

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/platform/v1/tenants/:id/users` | List users in a tenant |
| POST | `/platform/v1/tenants/:id/users` | Create a tenant user (body: `username`, `email?`, `password?`, `role`) |
| PATCH | `/platform/v1/tenants/:id/users/:userId` | Update a tenant user |
| DELETE | `/platform/v1/tenants/:id/users/:userId` | Delete a tenant user |
| POST | `/platform/v1/tenants/:id/users/:userId/reset-password` | Reset a tenant user's password |

### Tenant Audit & Backups

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/platform/v1/tenants/:id/audit-logs` | List audit logs for a tenant |
| GET | `/platform/v1/tenants/:id/backups` | List backups for a tenant |

### Global Users

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/platform/v1/users` | List all users (query: `page`, `pageSize`, `isSuperAdmin`, `search`, `sortBy`, `order`) |
| GET | `/platform/v1/users/:id` | Get a user |
| PATCH | `/platform/v1/users/:id` | Update a user (`email`, `isSuperAdmin`, `isActive`, `role`) |
| DELETE | `/platform/v1/users/:id` | Delete a user |
| POST | `/platform/v1/users/:id/grant-superadmin` | Grant superadmin (`isSuperAdmin = true`) |
| POST | `/platform/v1/users/:id/revoke-superadmin` | Revoke superadmin |

### Subscriptions

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/platform/v1/subscriptions` | List all subscriptions |
| PATCH | `/platform/v1/subscriptions/:tenantId` | Update a subscription (`plan`, `subscriptionExpiresAt`, `limitsOverride`) |

### Stats

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/platform/v1/stats` | Global platform stats (tenant count, revenue/MRR, usage aggregates) |

### Audit Logs (global)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/platform/v1/audit-logs` | List global audit logs (query: `page`, `pageSize`, `tenantId`, `action`, `username`, `startDate`, `endDate`, `search`, `export`) |

### Settings

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/platform/v1/settings` | Get platform settings |
| PUT | `/platform/v1/settings` | Update platform settings |

---

## Error Codes

| Code | HTTP | Meaning |
| ---- | ---- | ------- |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Insufficient role or tenant mismatch |
| `TENANT_UNAVAILABLE` | 403 | Tenant suspended or demo expired |
| `TENANT_CONTEXT_REQUIRED` | 403 | No tenant context in request |
| `TENANT_NOT_FOUND` | 404 | Tenant does not exist |
| `SUBSCRIPTION_FEATURE_REQUIRED` | 403 | Feature not in tenant's plan |
| `VISIT_LIMIT_EXCEEDED` | 403 | Monthly visit limit reached |
| `VISITOR_LIMIT_EXCEEDED` | 403 | Visitor limit reached |
| `USER_LIMIT_EXCEEDED` | 403 | User limit reached |
| `USER_ROLE_LIMIT_EXCEEDED` | 403 | Per-role user limit reached |
| `RATE_LIMIT` | 429 | Rate limit exceeded |
| `BLOCKED` | 403 | IP blocked by firewall |
| `TEMPORARILY_BLOCKED` | 429 | Too many suspicious activities |
| `SUSPICIOUS_USER_AGENT` | 403 | Blocked user agent |
| `PAYLOAD_TOO_LARGE` | 413 | Request body too large |
| `INVALID_REQUEST` | 400 | Suspicious URL pattern / validation error |

---

## OpenAPI Spec

The full OpenAPI 3.0 specification (~2000 lines of YAML) is available as a collapsible code block below. It defines every endpoint, schema, security scheme, and response code referenced in this document. Interactive Swagger UI is served at `/api-docs` in non-production environments.

<details>
<summary><b>OpenAPI 3.0 YAML (click to expand)</b></summary>

```yaml
openapi: 3.0.3
info:
  title: LogMaster API
  description: |
    Multi-tenant SaaS API for visitor management. Includes authentication, visitor
    management, visit lifecycle, audit logging, privacy/ARCO (GDPR / Ley 25.326),
    backups, subscriptions, and platform (superadmin) endpoints.

    ## Authentication
    All protected endpoints require a Bearer JWT: `Authorization: Bearer <accessToken>`.
    SSE endpoints accept the token via `?token=<accessToken>` query parameter.

    ## Tenant Context
    Tenant-scoped routes include `:tenantSlug` in the path. The middleware chain
    `verifyToken -> resolveTenant -> verifyTenantMembership` populates the tenant
    context from the JWT and URL.

    ## Response Envelope
    All JSON responses use `{ success: boolean, data?: ..., error?: { code, message, details? } }`.
  version: 1.0.0
  contact:
    name: Gustavo Colina (@Suggus1899)
    url: https://github.com/Suggus1899/Visitors
  license:
    name: UNLICENSED
servers:
  - url: http://localhost:3001
    description: Local development
  - url: https://api.yourdomain.com
    description: Production
```

> The complete OpenAPI YAML (all 2000+ lines with every path, schema, and response) was previously maintained in `docs/openapi.yaml`. It has been consolidated into this document. The full machine-readable spec is generated from the route definitions in `server/src/routes/` and the Swagger setup in `server/src/config/`. To regenerate or view it interactively, run the server locally and open `http://localhost:3001/api-docs`.

</details>
