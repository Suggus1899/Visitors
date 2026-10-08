# Security — LogMaster

## Authentication & Authorization

- **JWT access tokens** (15min) + **refresh tokens** (7d) with HS256 signing
- Token blacklist (in-memory) — revoked tokens rejected globally
- Password policy: 12+ chars, upper+lower+digit+special, common-password check
- Rate limiting: 100 req/min general, 30 req/min admin, 20 req/min reports (production)
- Account lockout: 5 failed attempts → 15min lock

## Environment & Secrets

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | 64-byte hex key for token signing |
| `ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM field encryption |
| `SEED_ADMIN_PASSWORD` | Admin seed password (overridable via env, never hardcoded) |
| `DB_PASSWORD` | PostgreSQL password |

All secrets loaded via `AppConfig` from `.env`. Never logged.

## CORS

Controlled by `ALLOWED_ORIGINS` env var (comma-separated). Updated automatically by `auto-env.bat` when LAN IP changes.

## Helmet & HTTP Headers

- Helmet middleware active in all environments
- HSTS enabled in production (requires valid SSL)

## Firewall

- Blocks known aggressive crawlers/bots by User-Agent regex
- All blocks logged via winston (not console.warn)
- Whitelist/bypass capability for health endpoints

## Input Validation

- Zod schemas on all public endpoints (auth, visits, privacy)
- Sanitization middleware on string fields
- File upload size limits

## Data Encryption

- AES-256-GCM for PII fields (names, cedula, email, phone)
- Encryption key in `ENCRYPTION_KEY` env var
- Encrypted at application layer before DB storage

## Retention & GDPR

| Data | Retention | Action |
|---|---|---|
| Visitor data | `DATA_RETENTION_DAYS` (default 60) | Purged via scheduler |
| Audit logs | `AUDIT_LOG_RETENTION_DAYS` (default 365) | Purged via scheduler |
| Photos | Same as visitor data | Deleted with visitor record |

## SMTP / Email

SMTP credentials required for password-reset flow. Configurable via `.env`:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
- `EMAIL_FROM`, `APP_URL`

Emails are logged (not sent) when SMTP is not configured.

## Pre-commit Checks (Husky)

Husky v9 runs on every commit:
- `pnpm run lint` (client)
- `pnpm exec tsc --noEmit` (client + server)
- `pnpm test` (client + server)

## CI/CD (GitHub Actions)

`.github/workflows/ci.yml` runs on push/PR:
1. Server tests with PostgreSQL service container
2. Client tests
3. Lint
4. Build

## Production Checklist

1. Generate fresh `JWT_SECRET` and `ENCRYPTION_KEY`
2. Set `NODE_ENV=production`
3. Configure SMTP credentials for password reset
4. Set strong `SEED_*_PASSWORD` overrides
5. Configure `ALLOWED_ORIGINS` with real domain
6. Set up SSL certificate via Let's Encrypt or CA
7. Verify rate limiter thresholds (production: 30 req/min admin)
8. Run CI pipeline against a real PR
