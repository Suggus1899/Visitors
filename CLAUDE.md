# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**LogMaster** — multi-tenant SaaS for visitor management (visitor check-in/out, audit trail, GDPR/Ley 25.326 ARCO compliance). Every tenant (organization) gets an isolated workspace: its own visitors, visits, users, audit log, backups, and subscription plan.

Full command reference and per-app port/test matrix: [AGENTS.md](AGENTS.md). Deep architecture (multi-tenancy, auth flow, encryption, rate limiting): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — note it still documents the pre-reorg flat `server/src/{domain,application,infrastructure,controllers}` layout; the code has since moved to bounded contexts (see below), so trust this file and the source over that doc for directory paths.

## Repo shape

pnpm workspace + Turborepo, **not** part of the wider `F:\Proyectos` folder's git history — this is its own repo. Workspace members: `apps/*`, `packages/*`, and `server` (server is a workspace package, invoked as `pnpm --filter @logmaster/server ...` or `pnpm --dir server ...`; both patterns are used interchangeably in root scripts).

- `apps/{landing,platform,admin,auditor,system}` — five Next.js 15 / React 19 apps, ports 5173–5177. All have migrated to Next.js (an older Vite-SPA migration note in README.md is stale).
- `server` — Express + Sequelize + PostgreSQL API, port 3001.
- `packages/{types,utils,config,ui,api,auth}` — shared code. Dependency order: `types` → `utils`/`config` → `ui`/`api` → `auth`. `landing` and `platform` don't consume `ui`/`auth` (own minimal implementations).
- `e2e/` — Playwright, root-level, 39 tests.

Commands, per-app dev ports, Docker service map: see [AGENTS.md](AGENTS.md). Don't re-derive them here.

## Server architecture: hexagonal, organized by bounded context

`server/src` is **not** one hexagonal stack — it's four bounded contexts, each with its own `domain/` (entities, repository interfaces), `application/` (use cases, DTOs, mappers), `infrastructure/` (Sequelize repos, external services), `controllers/`, and `routes/`:

- `identity/` — users, tenants, tenant membership, auth, platform/superadmin console
- `visits/` — visitors, visits, check-in/out, intermittent logs, SSE events, tenant-feature flags
- `audit/` — activity log, ARCO privacy requests, reports
- `billing/` — backups, subscription/usage enforcement
- `shared/` — cross-context primitives only (event emitter interface/impl, DI registration)

Sequelize **models** (`server/src/models/`), **migrations** (`server/src/migrations/`), and **middleware** (`server/src/middleware/`) stay flat/global — they aren't split per context. `server/src/routes/` at the top level holds only `health.routes.ts`; every other router lives under its owning context and is wired into `app.ts` from there (e.g. `visits/routes/visit.routes.ts`, `identity/routes/auth.routes.ts`).

When adding a feature, first decide which context it belongs to, then follow that context's existing domain → application → infrastructure → controller → route chain. Cross-context calls should go through a repository/service interface, not a direct import of another context's internals.

### Dependency injection

DI runs on **tsyringe** (`server/src/shared/diRegistration.ts`), registered once at startup via `registerDependencies()`. Repositories and stateless services are singletons; use cases are resolved transiently. `server/src/shared/Container.ts` is a legacy facade some older call sites still use — it delegates to the tsyringe registration rather than duplicating wiring. Prefer resolving from `diContainer` directly in new code; don't extend the `Container` facade.

### Multi-tenancy — the one invariant that must never break

Every tenant-scoped table (`Visitors`, `Visits`, `ActivityLogs`, `ArcoRequests`, `VisitorEditHistory`, `IntermittentLogs`) carries a non-null `tenantId`, and every repository method takes `tenantId` and filters by it — there is no query path that skips this. JWT access tokens carry `tid`/`tslug`; the `resolveTenant` → `verifyTenantMembership` middleware chain (`server/src/middleware/auth.ts`) revalidates that the token's tenant matches the URL's tenant and that a `TenantUser` membership row exists, on every request. If you touch a repository or route, preserve this — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full data-isolation and encryption model (AES-256-GCM PII fields, SSE tenant filtering, rate-limit tiers).

## Conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`), no AI attribution in commits/PRs/code.
- Code, identifiers, comments, UI copy: English.
- pnpm only (`packageManager` pinned in root `package.json`).
