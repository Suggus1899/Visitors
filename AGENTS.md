# AGENTS.md — LogMaster (Visitors)

## Stack

- **Monorepo**: pnpm workspace + Turborepo
- **Package manager**: pnpm (see `packageManager` in root `package.json`)
- **Workspaces**: `apps/*`, `packages/*`, `server`
- **Containerization**: Docker Compose (production)

## Apps & Frameworks

All frontend apps use **Next.js 15.5.20** (React 19, Tailwind CSS, TypeScript).

| App | Path | Framework | Dev port | Tests |
|-----|------|-----------|----------|-------|
| landing | `apps/landing` | Next.js 15 | 5173 | none configured |
| platform | `apps/platform` | Next.js 15 | 5174 | none configured |
| admin | `apps/admin` | Next.js 15 | 5175 | none configured |
| auditor | `apps/auditor` | Next.js 15 | 5176 | none configured |
| system | `apps/system` | Next.js 15 | 5177 | Vitest |
| server | `server` | Express + Sequelize (Node/TS) | 3001 | Vitest |

Shared packages live under `packages/*` (e.g. `@logmaster/api`, `@logmaster/auth`, `@logmaster/ui`, `@logmaster/types`, `@logmaster/utils`, `@logmaster/config`).

## Commands

### Install

```bash
pnpm install
```

### Per-app (via pnpm filter)

```bash
pnpm --filter @logmaster/landing  run dev
pnpm --filter @logmaster/platform run dev
pnpm --filter @logmaster/admin    run dev
pnpm --filter @logmaster/auditor  run dev
pnpm --filter @logmaster/system   run dev
pnpm --filter @logmaster/server   run dev
```

Same pattern for `test`, `build`, `lint`, `typecheck`:

```bash
pnpm --filter <app-name> run test
pnpm --filter <app-name> run build
pnpm --filter <app-name> run lint
pnpm --filter <app-name> run typecheck
```

### Root (Turborepo orchestration)

```bash
pnpm run dev      # server + all apps via concurrently + turbo
pnpm run build    # turbo run build && server build
pnpm run test     # turbo run test && server test
pnpm run lint     # turbo run lint && server lint
pnpm run typecheck
```

### Database (server)

```bash
pnpm run db:setup    # migrate + seed
pnpm run db:migrate
pnpm run db:seed
pnpm run db:reset
```

### E2E (Playwright)

```bash
pnpm run e2e
pnpm run e2e:ui
pnpm run e2e:report
```

## Docker

```bash
docker compose up -d --build
docker compose logs -f server
docker compose down
```

### Services

| Service | Image / Build | Port |
|---------|---------------|------|
| postgres | `postgres:16-alpine` | 5432 |
| server | `server/Dockerfile` (Express) | 3001 (host) / 3001 |
| landing | `apps/landing/Dockerfile` | 8080 → 3000 |
| platform | `apps/platform/Dockerfile` | 8081 → 3000 |
| admin | `apps/admin/Dockerfile` | 8082 → 3000 |
| auditor | `apps/auditor/Dockerfile` | 8083 → 3000 |
| system | `apps/system/Dockerfile` | 8084 → 3000 |

Network: `logmaster` (bridge). Volumes: `postgres_data`, `server_backups`, `server_data`.

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- **No AI attribution**: never add `Co-Authored-By` or `Generated with` lines to commits, PRs, or code.
- **Language**: code, identifiers, comments, and UI copy in English.

## SDD (Spec-Driven Development)

Run `/sdd-init` with cwd set to this repository root (`F:\Proyectos\Visitors`).

- **Stack**: pnpm monorepo (5 Next.js apps + Express server) + Docker Compose.
- **Testing**: Vitest on `server` and `apps/system`; other apps have no test runner configured. E2E via Playwright at root.
- **Artifact store**: choose during `/sdd-init` (engram / openspec / hybrid).
