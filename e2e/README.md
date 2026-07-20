# LogMaster E2E Tests (Playwright)

End-to-end smoke and critical-flow tests for all five LogMaster apps, plus a
cross-app auth suite.

## Structure

```
e2e/
  fixtures/users.ts          # Seed test users (credentials from SEED_*_PASSWORD)
  helpers/auth.ts            # loginViaUI, loginViaAPI, selectTenant, logoutViaUI
  landing/landing.spec.ts    # Marketing site smoke tests
  platform/platform.spec.ts  # Superadmin console
  admin/admin.spec.ts        # Tenant admin console
  auditor/auditor.spec.ts    # Audit & compliance console
  system/system.spec.ts      # Guard / reception operations
  cross-app/auth.spec.ts     # Cross-app login + role-guard redirects
  tsconfig.json              # Type-checking config for the e2e folder
```

## Prerequisites

1. **Install Playwright browser** (one-time):

   ```bash
   pnpm e2e:install
   # or: pnpm exec playwright install chromium
   ```

2. **Seed passwords must be set.** The test users live in `e2e/fixtures/users.ts`
   and read credentials from `SEED_*_PASSWORD` env vars (falling back to the
   defaults in `.env.example`). Make sure the server's `.env` defines every
   `SEED_*_PASSWORD` used by the suites:

   - `SEED_ROOT_PASSWORD` (trebolmaster)
   - `SEED_ADMIN_PASSWORD` (Admin)
   - `SEED_OPERADOR_PASSWORD` (operador)
   - `SEED_GUARD_PASSWORD` (guard)
   - `SEED_AUDITOR_PASSWORD` (auditor)

3. **Run the database seed** so the users and the `default` tenant exist:

   ```bash
   pnpm db:seed
   ```

## Running the tests

Playwright does **not** start the apps or the backend. Start them first.

### Start servers

In one terminal, start the backend on port **3001** (the Vite proxies target
`localhost:3001`):

```bash
PORT=3001 pnpm dev:server
```

In another terminal, start the apps you want to test:

```bash
pnpm dev:landing      # http://localhost:5173
pnpm dev:platform     # http://localhost:5174
pnpm dev:admin        # http://localhost:5175
pnpm dev:auditor      # http://localhost:5176
pnpm dev:system       # http://localhost:5177
```

> Tip: `pnpm dev` starts the server + all apps via turborepo, but the backend
> must listen on `3001` for the Vite proxies to work.

### Run E2E

```bash
pnpm e2e                 # run all projects
pnpm e2e -- --project=admin          # run a single app's tests
pnpm e2e -- --project=platform
pnpm e2e -- --project=auditor
pnpm e2e -- --project=system
pnpm e2e -- --project=landing
pnpm e2e -- --project=cross-app
```

### Interactive UI mode

```bash
pnpm e2e:ui
```

### View the HTML report

```bash
pnpm e2e:report
```

## Overriding base URLs

Each project's base URL defaults to the local dev port and can be overridden
with an env var:

| Project  | Env var             | Default                  |
| -------- | ------------------- | ------------------------ |
| landing  | `LANDING_BASE_URL`  | `http://localhost:5173`  |
| platform | `PLATFORM_BASE_URL` | `http://localhost:5174`  |
| admin    | `ADMIN_BASE_URL`    | `http://localhost:5175`  |
| auditor  | `AUDITOR_BASE_URL`  | `http://localhost:5176`  |
| system   | `SYSTEM_BASE_URL`   | `http://localhost:5177`  |

Example:

```bash
ADMIN_BASE_URL=http://localhost:6175 pnpm e2e -- --project=admin
```

## Type-checking the test files

```bash
pnpm exec tsc -p e2e/tsconfig.json --noEmit
```

## Notes & TODOs

- **Platform mock fallback:** `apps/platform` falls back to an in-memory mock
  when the backend is unreachable. In mock mode login accepts any credentials
  and always grants superadmin, so the platform "non-superadmin rejected" test
  only passes against the real backend (configure `VITE_API_URL` so
  `/v1/auth/login` reaches the server).
- **Tenant selection:** With the single seeded `default` tenant, the admin and
  auditor apps auto-select it and skip the tenant selector. The `selectTenant`
  helper is only exercised in multi-tenant (demo) scenarios.
- Selectors prefer `getByRole` / `getByText` / IDs over brittle CSS.
