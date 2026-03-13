# Troubleshooting

## Anti-pattern: Fat Controllers

**Symptom:** Controllers contain business logic, DB calls, or complex conditionals.
**Fix:** Extract all logic to services. Controllers should only: parse input → call service → send response.

## Anti-pattern: Scattered Environment Access

**Symptom:** `process.env.X` appears in multiple files across the codebase.
**Fix:** Centralize in `src/config/index.(js|ts)`. Import config object everywhere else.

## Anti-pattern: No Validation Layer

**Symptom:** Endpoints accept any input without validation; errors surface deep in business logic.
**Fix:** Add Zod/Joi schemas in `validators/` and validate at the controller or route level before any processing.

## Anti-pattern: Mixed Concerns in Repositories

**Symptom:** Repository files contain business rules, permission checks, or response formatting.
**Fix:** Repositories do ONE thing: execute queries and return data. All logic belongs in services.

## Anti-pattern: Inconsistent Error Responses

**Symptom:** Different endpoints return errors in different shapes, making client-side handling fragile.
**Fix:** Use the standardized `{ success, error: { code, message, details } }` shape everywhere via `http-response` helpers and the global error handler.

---

## Why `--env-file-if-exists`?

In local development, you typically have a `.env` file with database URLs, API keys, etc. In production, environment variables are injected by the platform (Docker, Kubernetes, Render, Fly.io, etc.) — there is no `.env` file.

Using `--env-file` would crash the process if `.env` is missing. Using `--env-file-if-exists` (added v22.9.0, non-experimental from v24.10.0) means:
- **Dev:** `.env` is present → variables load automatically.
- **Prod:** `.env` is absent → Node starts normally, reads vars from the environment.
- **Same command works everywhere** — no conditional scripts, no `dotenv` package, no `if [ -f .env ]` shell wrappers.

On Node 22.x / early 24.x the flag works but is labeled experimental (cosmetic warning only). On Node 20.x where the flag isn't available, use `process.loadEnvFile('.env')` inside a try/catch (see [scripts-and-env.md](scripts-and-env.md), Tier C) for the same dev/prod parity.

---

## `node --watch --env-file-if-exists` errors when `.env` is missing

**Symptom:** `node --watch --env-file-if-exists=.env` throws an error or fails to start when `.env` is not present.
**Fix:** Upgrade Node to the latest 24.x (preferably >=24.10.0) where `--env-file-if-exists` is fully stable. If upgrading isn't possible, switch to Tier C programmatic loading with `process.loadEnvFile()` in a try/catch (see [scripts-and-env.md](scripts-and-env.md), Tier C).
