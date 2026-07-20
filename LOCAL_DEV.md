# LogMaster — Local Development Guide (Without Docker)

This guide covers running the entire LogMaster monorepo locally on your machine
without Docker. You will run the Express/Sequelize backend and all Vite/React
frontends directly with hot reload.

---

## Prerequisites

| Tool           | Version  | Notes                                            |
| -------------- | -------- | ------------------------------------------------ |
| **Node.js**    | 20.x LTS | Check with `node -v`                             |
| **pnpm**       | 11.x     | Install with `npm install -g pnpm`               |
| **PostgreSQL** | 16       | Must be running locally on port 5432             |

### Verify prerequisites

```bash
node -v          # v20.x.x
pnpm -v          # 11.x.x
psql --version   # psql (PostgreSQL) 16.x
```

---

## Quick Start (5 steps)

### 1. Clone and install dependencies

```bash
git clone https://github.com/Suggus1899/Visitors.git
cd Visitors
pnpm install:all
```

> `pnpm install:all` is an alias for `pnpm install`. It installs dependencies
> for the root, all apps, all shared packages, and the server.

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

| Variable         | Description                          | Example                |
| ---------------- | ------------------------------------ | ---------------------- |
| `DB_PASSWORD`    | Your local PostgreSQL password       | `my_postgres_password` |
| `JWT_SECRET`     | JWT signing secret (min 32 chars)    | generate one (see below) |
| `ENCRYPTION_KEY` | AES-256 encryption key (64 hex chars)| generate one (see below) |

Generate secure secrets:

```bash
# JWT secret (128 hex characters)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Encryption key (64 hex characters — 32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Important:** The `.env` file must live at the **project root** (not inside
> `server/`). The server loads it from `../../.env` relative to its config
> directory.

### 3. Create the database

```bash
# Option A: using createdb
createdb -U postgres visitors

# Option B: using psql
psql -U postgres -c "CREATE DATABASE visitors;"
```

### 4. Run migrations and seed data

```bash
pnpm db:setup
```

This runs migrations (`pnpm db:migrate`) and then seeds the database
(`pnpm db:seed`) with initial users and demo data.

### 5. Start everything

```bash
pnpm dev
```

This starts the **server** and **all frontend apps** in parallel with hot
reload. Open the app you need in your browser (see ports table below).

---

## Default Ports

| Service           | Port  | URL                        |
| ----------------- | ----- | -------------------------- |
| **Server (API)**  | 3001  | http://localhost:3001      |
| **Landing**       | 5173  | http://localhost:5173      |
| **Platform**      | 5174  | http://localhost:5174      |
| **Admin**         | 5175  | http://localhost:5175      |
| **Auditor**       | 5176  | http://localhost:5176      |
| **System**        | 5177  | http://localhost:5177      |

All frontend apps proxy `/api` requests to `http://localhost:3001` automatically
via Vite's dev-server proxy. No CORS configuration needed during development.

---

## Running Individual Services

If you only need one app or the server, use the individual scripts:

```bash
pnpm dev:server      # Backend only (nodemon + ts-node hot reload)
pnpm dev:landing     # Landing page only
pnpm dev:platform    # Platform app only
pnpm dev:admin       # Admin dashboard only
pnpm dev:auditor     # Auditor app only
pnpm dev:system      # System (check-in kiosk) only
```

---

## Available Scripts (Root Level)

### Development

| Script              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `pnpm dev`          | Start server + all apps in parallel              |
| `pnpm dev:server`   | Start backend with hot reload (nodemon)          |
| `pnpm dev:landing`  | Start landing page (Vite)                        |
| `pnpm dev:platform` | Start platform app (Vite)                        |
| `pnpm dev:admin`    | Start admin app (Vite)                           |
| `pnpm dev:auditor`  | Start auditor app (Vite)                         |
| `pnpm dev:system`   | Start system app (Vite)                          |

### Build

| Script              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `pnpm build`        | Build all apps (turbo) + server                  |
| `pnpm build:server` | Compile server TypeScript to `server/dist/`      |
| `pnpm build:landing`| Build landing page                               |
| `pnpm build:platform` | Build platform app                             |
| `pnpm build:admin`  | Build admin app                                  |
| `pnpm build:auditor`| Build auditor app                                |
| `pnpm build:system` | Build system app                                 |

### Quality

| Script              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `pnpm lint`         | Lint all apps/packages (turbo) + server          |
| `pnpm typecheck`    | Type-check all apps/packages (turbo) + server    |
| `pnpm test`         | Run tests in all apps/packages (turbo) + server  |

> Individual apps and the server also support `pnpm --dir <path> run lint`,
> `pnpm --dir <path> run typecheck`, and `pnpm --dir <path> run test`.

### Database

| Script              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `pnpm db:setup`     | Run migrations + seed (first-time setup)         |
| `pnpm db:migrate`   | Run pending migrations only                      |
| `pnpm db:seed`      | Run seeder only (adds data, keeps existing)      |
| `pnpm db:reset`     | Drop & recreate all tables, then seed (full reset) |

> `pnpm db:reset` uses `sequelize.sync({ force: true })` which **drops all
> tables** and recreates them from the model definitions, then seeds fresh
> data. Use with caution — all data will be lost.

### Utility

| Script              | Description                                      |
| ------------------- | ------------------------------------------------ |
| `pnpm install:all`  | Install all dependencies (`pnpm install`)        |
| `pnpm clean`        | Remove all `dist/`, `build/`, `.turbo/`, cache   |
| `pnpm start`        | Start server in production mode (`node dist/server.js`) |

---

## Project Structure

```
Visitors/
├── apps/                    # Frontend applications (Vite + React + TS)
│   ├── landing/             #   Landing page        (port 5173)
│   ├── platform/            #   Platform app        (port 5174)
│   ├── admin/               #   Admin dashboard     (port 5175)
│   ├── auditor/             #   Auditor app         (port 5176)
│   └── system/              #   System / check-in   (port 5177)
├── packages/                # Shared workspace packages
│   ├── ui/                  #   Shared UI components
│   ├── api/                 #   API client (axios + react-query)
│   ├── auth/                #   Auth hooks and context
│   ├── types/               #   Shared TypeScript types
│   ├── utils/               #   Shared utilities
│   └── config/              #   Shared config (Tailwind, etc.)
├── server/                  # Backend (Node.js + Express + Sequelize + TS)
│   ├── src/
│   │   ├── config/          #   App config, database, logger
│   │   ├── controllers/     #   HTTP controllers
│   │   ├── domain/          #   Domain entities
│   │   ├── application/     #   Use cases
│   │   ├── infrastructure/  #   Implementations
│   │   ├── middleware/      #   Express middleware
│   │   ├── models/          #   Sequelize models
│   │   ├── routes/          #   Route definitions
│   │   ├── scripts/         #   DB scripts (migrate, seed, reset)
│   │   └── server.ts        #   Entry point
│   ├── nodemon.json         #   Nodemon config (hot reload)
│   └── tsconfig.json
├── .env.example             # Environment variable template
├── pnpm-workspace.yaml      # pnpm workspace config
├── turbo.json               # Turborepo pipeline config
└── package.json             # Root scripts and devDependencies
```

---

## Testing

Run all tests across the monorepo:

```bash
pnpm test
```

Run tests for a specific app or the server:

```bash
pnpm --dir apps/system run test          # System app (has Vitest tests)
pnpm --dir server run test               # Server (Vitest)
```

Run tests in watch mode:

```bash
pnpm --dir apps/system run test:watch
pnpm --dir server run test:watch
```

Generate coverage reports:

```bash
pnpm --dir apps/system run test:coverage
pnpm --dir server run test:coverage
```

> **Note:** Only `apps/system` and `server/` have test suites configured with
> Vitest. Other apps show "No tests configured" when running `pnpm test`.

---

## Linting

```bash
pnpm lint                    # Lint everything
pnpm --dir apps/landing run lint   # Lint one app
pnpm --dir server run lint         # Lint server
```

> **Note:** `apps/admin` and `apps/auditor` do not have ESLint configured.
> Their `lint` script runs `tsc --noEmit` (TypeScript type-checking) as a
> fallback. To add ESLint to these apps, copy the `.eslintrc.cjs` from
> `apps/system` and install the ESLint devDependencies.

---

## Type Checking

```bash
pnpm typecheck               # Type-check everything
pnpm --dir apps/admin run typecheck   # Type-check one app
pnpm --dir server run typecheck       # Type-check server
```

---

## Troubleshooting

### Port already in use

**Symptom:** `EADDRINUSE: address already in use` or Vite shows a port conflict.

**Fix:**
```bash
# Find what's using the port (Windows)
netstat -ano | findstr :3001

# Kill the process (replace <PID> with the actual PID)
taskkill /PID <PID> /F
```

If Vite automatically increments the port (e.g., 5174 → 5175), it means another
app is already on that port. Make sure you're not running two apps on the same
port. Check the [ports table](#default-ports) for the correct assignment.

### Database connection refused

**Symptom:** `SequelizeConnectionError: connect ECONNREFUSED 127.0.0.1:5432`

**Fix:**
1. Verify PostgreSQL is running:
   ```bash
   # Windows
   Get-Service postgresql*
   # Or check if the service is listening
   netstat -ano | findstr :5432
   ```
2. Verify your `.env` has the correct credentials:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=visitors
   DB_USER=postgres
   DB_PASSWORD=your_actual_password
   ```
3. Verify the database exists:
   ```bash
   psql -U postgres -c "\l visitors"
   ```

### JWT_SECRET not set

**Symptom:** `Configuration validation failed: JWT_SECRET must be set`

**Fix:** The server requires `JWT_SECRET` in `.env`. Generate one:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Add it to your `.env` file at the project root.

### Environment variables not loading

**Symptom:** Server uses default values instead of your `.env` values.

**Fix:** The `.env` file **must be at the project root** (`Visitors/.env`), not
inside `server/`. The server loads it from `../../.env` relative to its compiled
location. Verify the file exists:
```bash
ls .env
```

### Migrations fail

**Symptom:** `Migration failed` error when running `pnpm db:migrate`.

**Fix:**
1. Ensure the database exists (`createdb -U postgres visitors`)
2. Ensure the database user has permissions
3. Try a full reset: `pnpm db:reset`

### pnpm workspace issues

**Symptom:** `ERR_PNPM_NO_MATCHING_VERSION` or workspace package not found.

**Fix:**
```bash
pnpm clean
pnpm install:all
```

### TypeScript build errors in server

**Symptom:** `tsc` reports errors when running `pnpm build:server`.

**Fix:** The server `tsconfig.json` excludes `src/scripts/**` and
`src/__tests__/**` from the build. If you see errors from those directories,
they won't affect the production build. Run `pnpm --dir server run typecheck`
to see all type errors including tests.

### Node modules cache issues

If things behave unexpectedly after pulling changes:

```bash
pnpm clean
rm -rf node_modules
pnpm install:all
```

---

## Seed Credentials (Development Only)

After running `pnpm db:seed`, the following users are available with the
default passwords from `.env.example`:

| Role      | Username    | Password (from .env.example)  |
| --------- | ----------- | ----------------------------- |
| Root      | (seeded)    | `SEED_ROOT_PASSWORD`          |
| Admin     | (seeded)    | `SEED_ADMIN_PASSWORD`         |
| Operador  | (seeded)    | `SEED_OPERADOR_PASSWORD`      |
| Auditor   | (seeded)    | `SEED_AUDITOR_PASSWORD`       |
| Demo      | (seeded)    | `SEED_DEMO_PASSWORD`          |

> **Change these passwords in production!** See `.env.example` for the default
> values and `docs/SEED_CREDENTIALS.md` for full credential details.

---

## Daily Workflow

```bash
# 1. Start PostgreSQL (if not running as a service)
#    Windows:  net start postgresql-x64-16
#    Or start via pgAdmin / Services console

# 2. Start development (server + all apps)
pnpm dev

# 3. Work on your feature...

# 4. Run tests
pnpm test

# 5. Lint and type-check before committing
pnpm lint
pnpm typecheck

# 6. Build to verify production build works
pnpm build
```

---

## Notes

- The `server/` directory is **not** part of the pnpm workspace
  (`pnpm-workspace.yaml` only includes `apps/*` and `packages/*`). Root scripts
  use `pnpm --dir server` to run server commands.
- `pnpm dev` uses `concurrently` to start the server (via nodemon) and all
  workspace apps (via `turbo run dev`) in parallel.
- The server uses `nodemon` + `ts-node` for hot reload during development
  (configured in `server/nodemon.json`).
- For production, build the server with `pnpm build:server` and start it with
  `pnpm start` (runs `node dist/server.js`).
