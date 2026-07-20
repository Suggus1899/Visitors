# Deployment

This guide covers deploying LogMaster to production with Docker Compose, manual deployment, environment variables, SSL/TLS, monitoring, scaling, backup/restore, updates, and troubleshooting.

> For local development (without Docker) see [LOCAL_DEV.md](../LOCAL_DEV.md). For security best practices see the [Security section in ARCHITECTURE.md](./ARCHITECTURE.md#security).

---

## Prerequisites

| Requirement | Version | Notes |
| ------------ | ------- | ----- |
| **Docker** | 24+ | With Docker Compose v2 |
| **PostgreSQL** | 16 | Or use the `postgres` service in the compose file |
| **Domain** | — | A domain name pointing to your server (for SSL) |
| **SSL certificate** | — | Let's Encrypt via Caddy/Nginx, or a commercial cert |
| **Node.js** | 20.x LTS | Only for manual deployment |
| **pnpm** | 11.x | Only for manual deployment |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values. The `.env` file must be at the **project root** (not inside `server/`).

### Server Configuration

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `PORT` | `3001` | Express server port |
| `NODE_ENV` | `development` | Set to `production` for production |

### Database (PostgreSQL)

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `DB_PATH` | `./data` | Local file path for photos/logs |
| `DB_HOST` | `localhost` | PostgreSQL host (`postgres` in Docker) |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `visitors` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | — | **Required in production** |
| `DB_SSL` | `false` | Set to `true` for remote/cloud Postgres |

### JWT Authentication

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `JWT_SECRET` | — | **Required** (min 32 chars). Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | (derived) | Optional; auto-derived from `JWT_SECRET` if not set |
| `JWT_ACCESS_EXPIRATION` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRATION` | `7d` | Refresh token TTL |

### Data Encryption

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `ENCRYPTION_KEY` | — | AES-256 key (64 hex chars). **Required in production**. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PII_ENCRYPTION_KEY` | — | Alias for `ENCRYPTION_KEY` (forward compatibility) |

### Backup Configuration

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `BACKUP_PATH` | `./Backups` | Directory for encrypted backup files |
| `BACKUP_PASSWORD` | — | Password for backup encryption (falls back to `ENCRYPTION_KEY`) |

### GDPR Compliance

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `DATA_RETENTION_DAYS` | `60` | Days to retain visitor personal data after checkout |
| `AUDIT_LOG_RETENTION_DAYS` | `365` | Days to retain audit logs (should exceed data retention) |

### Security

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `BCRYPT_ROUNDS` | `12` | Bcrypt rounds for password hashing |
| `MAX_LOGIN_ATTEMPTS` | `5` | Failed login attempts before lockout |
| `LOCKOUT_DURATION_MINUTES` | `15` | Account lockout duration |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Global rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Global rate limit max per window |

### Edit Protection

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `EDIT_PASSWORD` | — | Password required to edit locked visitor records |

### Email (Password Reset)

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server host |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_SECURE` | `false` | Use TLS |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password (app-specific for Gmail) |
| `EMAIL_FROM` | `noreply@afvisitorsystem.com` | Sender address |
| `APP_URL` | `http://localhost:5173` | Application URL for reset links |

### CORS / Network

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `ALLOWED_ORIGINS` | — | Comma-separated allowed CORS origins |
| `PRODUCTION_DOMAIN` | — | Production domain for CORS subdomain matching |

### Seed Passwords (development only)

| Variable | Default (`.env.example`) | Description |
| -------- | ------------------------ | ----------- |
| `SEED_ROOT_PASSWORD` | `TrebolMaster2026!` | Root/superadmin seed password |
| `SEED_ADMIN_PASSWORD` | `Trebol123*` | Admin seed password |
| `SEED_GUARD_PASSWORD` | `Guard2026!@#` | Guard/operador seed password |
| `SEED_OPERADOR_PASSWORD` | `Operador2026!` | Operador seed password |
| `SEED_AUDITOR_PASSWORD` | `Audit2026!@#` | Auditor seed password |
| `SEED_DEMO_PASSWORD` | `Demo123!@#` | Demo seed password |

> **Change all seed passwords in production before seeding.**

### Multi-Tenant SaaS (optional)

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `DEMO_EXPIRY_HOURS` | `24` | Demo tenant expiry (overridden to 7 days in use case) |
| `DEFAULT_TRIAL_DAYS` | `14` | Default trial period |
| `DEFAULT_TENANT_MAX_USERS` | `5` | Default max users per tenant |
| `DEFAULT_TENANT_MAX_VISITORS` | `1000` | Default max visitors per tenant |
| `PLAN_FREE_VISITS_PER_MONTH` | `100` | Free plan visit limit |
| `PLAN_STARTER_VISITS_PER_MONTH` | `500` | Starter plan visit limit |
| `PLAN_PROFESSIONAL_VISITS_PER_MONTH` | `2000` | Professional plan visit limit |
| `PLAN_FREE_MAX_USERS` | `3` | Free plan max users |
| `PLAN_STARTER_MAX_USERS` | `7` | Starter plan max users |
| `PLAN_PROFESSIONAL_MAX_USERS` | `21` | Professional plan max users |
| `BACKUP_SCHEDULER_POLL_MINUTES` | `15` | Backup scheduler poll interval |

---

## Docker Deployment

LogMaster ships with `docker-compose.yml` (7 services) and `docker-compose.dev.yml` (hot-reload override).

### Services

| Service | Container | Port (host) | Description |
| ------- | --------- | ----------- | ----------- |
| `postgres` | `logmaster-postgres` | 5432 | PostgreSQL 16 Alpine |
| `server` | `logmaster-server` | 3001 | Express API |
| `landing` | `logmaster-landing` | 8080 | Landing page (nginx) |
| `platform` | `logmaster-platform` | 8081 | Platform app (nginx) |
| `admin` | `logmaster-admin` | 8082 | Admin app (nginx) |
| `auditor` | `logmaster-auditor` | 8083 | Auditor app (nginx) |
| `system` | `logmaster-system` | 8084 | System app (nginx) |

### Production deployment

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with production values (see Environment Variables above)

# 2. Build and start all services
docker compose up -d --build

# 3. Run migrations and seed (first time only)
docker compose exec server pnpm db:setup

# 4. Check health
curl http://localhost:3001/api/v1/health

# 5. View logs
docker compose logs -f server
```

### Development with Docker (hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

This mounts source code as volumes and runs Vite/nodemon with hot reload. Frontend apps are served on their native ports (5173–5177); Postgres is exposed on 5433 to avoid conflicts with a local Postgres.

### Stopping

```bash
docker compose down              # Stop and remove containers
docker compose down -v           # Also remove volumes (DELETES DATA)
```

---

## Manual Deployment

For environments without Docker:

```bash
# 1. Install dependencies
pnpm install:all

# 2. Build everything
pnpm build

# 3. Configure environment
cp .env.example .env
# Edit .env

# 4. Create database and run migrations + seed
createdb -U postgres visitors
pnpm db:setup

# 5. Start the server
pnpm start    # runs node dist/server.js

# 6. Serve frontend apps
# Each app builds to dist/ — serve with nginx, Caddy, or a static host
pnpm build:admin     # builds apps/admin/dist
pnpm build:system    # builds apps/system/dist
# etc.
```

---

## Database Setup

### Migrations

Migrations use Umzug (`server/src/config/umzug.ts`) and are applied via Sequelize model sync or migration files.

```bash
pnpm db:migrate    # Run pending migrations
pnpm db:setup      # Migrate + seed
pnpm db:reset      # Drop & recreate all tables, then seed (DESTRUCTIVE)
```

### Seeder

The seeder (`server/src/utils/seeder.ts`) creates:
- A `default` tenant (enterprise plan, for legacy single-tenant compatibility).
- Seed users: `Admin` (admin), `operador`, `guard` (operador), `auditor`, `demo`, `trebolmaster` (root).
- Sample visitors and visits for the default tenant.

Passwords come from `SEED_*_PASSWORD` env vars.

---

## SSL / TLS

Terminate TLS at a reverse proxy in front of the Express server. Example with Nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE support
    location /api/v1/events/ {
        proxy_pass http://localhost:3001;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

For the frontend apps, serve the built `dist/` folders via Nginx static file blocks or a CDN.

> Set `DB_SSL=true` when connecting to a remote/cloud PostgreSQL over SSL.

---

## Monitoring

### Health endpoint

```bash
curl http://localhost:3001/api/v1/health
```

```json
{
  "status": "healthy",
  "service": "logmaster-api",
  "version": "1.0.0",
  "uptime": 3600,
  "database": true,
  "jwt": true,
  "timestamp": "2026-01-15T12:00:00.000Z"
}
```

Returns `503` if the database is unreachable or `JWT_SECRET` is missing/short. This endpoint is exempt from rate limiting.

### Logs

Winston logger (`server/src/config/logger.ts`) with daily rotating files in `logs/`. Log levels: `error`, `warn`, `info`, `debug`. Ship logs to a log aggregator (Datadog, ELK, Grafana Loki) for production monitoring.

### Docker logs

```bash
docker compose logs -f server       # Follow server logs
docker compose logs -f postgres     # Follow Postgres logs
docker compose logs --tail=100 server   # Last 100 lines
```

---

## Scaling

### Vertical scaling

Increase CPU/RAM on the server host. The Express server is single-process; for multi-core, use Node's `cluster` module or a process manager (PM2).

### Horizontal scaling

For multi-instance deployments, replace in-memory stores with shared ones:

| Component | In-memory (single-instance) | Shared (multi-instance) |
| --------- | --------------------------- | ---------------------- |
| Token blacklist | `TokenBlacklist` (in-process) | Redis |
| Rate limiter store | `express-rate-limit` memory store | Redis (`rate-limit-redis`) |
| SSE event emitter | `EventEmitterService` (in-process) | Redis Pub/Sub or a dedicated SSE gateway |

### Database scaling

- Use connection pooling (PgBouncer) for high connection counts.
- Read replicas for report/audit queries.
- Partition `ActivityLogs` and `Visits` by date for large tenants.

---

## Backup and Restore

### Automated backups

The backup scheduler (`server/src/utils/backupScheduler.ts`) creates backups per each tenant's plan frequency (`manual`, `daily`, `four-hour`, `continuous`). Backups are encrypted with AES-256-GCM and stored in `BACKUP_PATH`.

### Manual backup (API)

```bash
# Global backup (admin token)
curl -X POST http://localhost:3001/api/v1/backups \
  -H "Authorization: Bearer <admin-token>"

# Tenant backup (admin token, backupOnDemand feature)
curl -X POST http://localhost:3001/api/v1/:tenantSlug/backups \
  -H "Authorization: Bearer <admin-token>"
```

The response includes a one-time restore password (`trebol-XXXXXXXX-NNNN`). **Save this password** — it is not stored in plaintext.

### Manual backup (CLI)

```bash
pnpm backup       # pg_dump to backups/ (Windows PowerShell script)
```

### Restore

```bash
curl -X POST http://localhost:3001/api/v1/backups/:filename/restore \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"restorePassword": "trebol-XXXXXXXX-NNNN"}'
```

> Restoring overwrites the current database. Always test restores in a staging environment first.

---

## Update Procedure

```bash
# 1. Pull the latest code
git pull origin main

# 2. Install/update dependencies
pnpm install:all

# 3. Run pending migrations
pnpm db:migrate

# 4. Rebuild and restart Docker services
docker compose up -d --build

# 5. Verify health
curl http://localhost:3001/api/v1/health
```

For manual deployments:

```bash
git pull origin main
pnpm install:all
pnpm build
pnpm db:migrate
# Restart the server process (PM2, systemd, etc.)
pm2 restart logmaster-server
```

> Always back up the database before updating. Test updates in staging first.

---

## Troubleshooting

### Server won't start

- **`Configuration validation failed: JWT_SECRET must be set`** — `JWT_SECRET` is missing from `.env`. Generate one and add it.
- **`ECONNREFUSED 127.0.0.1:5432`** — PostgreSQL is not running. Start it or check `DB_HOST`/`DB_PORT`.
- **Port 3001 in use** — Find and kill the process: `netstat -ano | findstr :3001` (Windows) / `lsof -i :3001` (Linux).

### Database errors

- **`relation "Tenants" does not exist`** — Migrations haven't run. Execute `pnpm db:setup` (or `docker compose exec server pnpm db:setup`).
- **`ENCRYPTION_KEY not set, data will not be encrypted`** — Set `ENCRYPTION_KEY` in `.env`. PII is being stored in plaintext without it.

### Docker issues

- **Build fails** — Ensure Docker has enough memory (4GB+). Try `docker compose build --no-cache`.
- **`logmaster-postgres` unhealthy** — Check Postgres logs: `docker compose logs postgres`. Ensure `DB_PASSWORD` matches `POSTGRES_PASSWORD`.
- **Frontend apps can't reach API** — In Docker, apps are served by nginx on ports 8080–8084. Ensure your reverse proxy routes to the correct ports. In dev mode, Vite proxies `/api` to `:3001`.

### SSE not working

- Ensure the reverse proxy disables buffering for the `/api/v1/events/` path (see Nginx config above).
- Check that the token is passed as `?token=` query parameter.

### CORS errors

- Add your frontend origin to `ALLOWED_ORIGINS` or set `PRODUCTION_DOMAIN`.
- The server rejects unlisted origins with `Not allowed by CORS`.

### Rate limit (429)

- Check which limiter triggered (see the `message` field). Wait for the window to expire.
- In development, limits are relaxed. In production, ensure legitimate traffic doesn't exceed limits.
