# LogMaster Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the findings from the 2026-10-18 audit and prepare LogMaster for a controlled, fictitious-data pilot.

**Architecture:** Keep Next.js App Router, React, HeroUI, Go/Chi, sqlc, PostgreSQL 16, and the existing Compose/Nginx deployment. Fix shared security boundaries first, then schema and workflows, followed by backup capacity, load validation, and operating documentation.

**Tech Stack:** Next.js 16.4.1 minimum patch floor (recheck same-line security patches), React 19, Go 1.27.2, PostgreSQL 16, age v1.3.2, Vitest, Go tests, PostgreSQL integration tests, and Playwright.

**Spec:** Security scan `fc0636c5-db4d-4876-a934-391d1a6c1a33` and `auditoria-integral-2026-10-18.md` generated from commit `5ea6877`.

## Global Constraints

- Work directly on `main`; do not alter or remove pre-existing `docs/propuestas-grado/`, local databases, secrets, or backups.
- Never run an operational migration or restore against a real database during CI or laboratory validation.
- Keep startup free of automatic migrations and demo seeding.
- Maintain previous backup readability and do not claim enterprise acceptance from fictitious-data tests.
- The user selected global database sorting for dates, status, and company; logout revokes all account sessions; privacy UI and waiting-visit cancellation are in scope.
- PDF limit is 2,000 visits; Excel limit is 20,000. Keep identity/name search protected and avoid plaintext search indexes.
- Do not install Docker on this Windows host; run container acceptance in Linux CI/lab.

## Review Focus

- Fifty legitimate accounts sharing a proxy IP must not lock each other out; test SSR/BFF over trusted proxy headers.
- Logout or password/session-version changes must reject both old access and refresh tokens, including after restart.
- Identity-index migration and backup format migration must fail atomically on wrong keys, corrupt inputs, duplicates, or insufficient space.
- Cancelled waiting visits must never count as admissions; concurrent cancel/admit must permit only one transition.
- Export snapshots must remain internally consistent and must never download after cancellation or exceed configured limits.

---

## Task 1: Patch and pin the validated toolchain

- [x] Update `client/package.json` and lockfile to the patched Next.js and matching ESLint config; recheck advisories before install.
- [x] Align repository runtime pins and CI with Node 22, pnpm 12.4.2, Go 1.27.2; retain existing project-specific tool setup.
- [x] Run frozen install, client types/lint/build/tests, Go `-race` suite and vet; record the clean-install result.
- [x] Commit the toolchain patch independently.

## Task 2: Repair SSR session quotas, logout, renewal and logs

- [ ] Add failing tests for shared-IP 50-user access, invalid-cookie SSR requests, per-render session deduplication, logout token revocation, absolute seven-day expiry, internal-only `returnTo`, and redacted proxy logs.
- [x] Separate credential-abuse counting from session reads; preserve verified client IP through Next and only trust proxy-replaced forwarding headers.
- [x] Revoke the account `tokenVersion` atomically through Go logout; clear cookies and surface revocation failure. Preserve the session start time and seven-day absolute expiry in access and refresh JWTs.
- [x] Normalize/redact Nginx URLs and add safe request correlation without credentials, reset tokens, full IDs, or SQL values.
- [ ] Run tests plus the relevant Next/Go integration and proxy-log checks; commit.

## Task 3: Replace raw identifier hashes with a protected identity index

- [ ] Add tests for HMAC identity separation from random-token hashing, uniqueness/linkage, anonymization, wrong key, duplicate legacy rows, and rollback.
- [ ] Add an idempotent, maintenance-only migration that maps old visitor hashes to HMAC identities across visitors, visits, privacy requests, and references.
- [ ] Convert in batches under a transaction/maintenance gate; mark readiness only after full integrity verification. Preserve old backups through staged restore-and-migrate.
- [ ] Refuse application startup on incomplete or wrong-key preparation; run isolated PostgreSQL migration/adoption/rehearsal tests; commit.

## Task 4: Add privacy workflows and waiting-visit cancellation

- [ ] Add Go and client tests for role permissions, required reason, audit atomicity, new visit after cancellation, privacy requests, edit-password enforcement, and anonymization.
- [ ] Add a `cancelled` terminal visit status and `POST /api/v1/visits/:id/cancel`; permit only `waiting` transitions, require a reason, actor, timestamp, and audit event in the same transaction.
- [ ] Update SQL migrations, generated SQL/models, filters, statistics, calendar, exports and DTOs. Exclude cancelled visits from admission/duration counts.
- [ ] Build the privacy screens over the existing ARCO API and current role matrix. Require identity-verification procedure before cancellation, preserve auditor read-only access, and hide writes for demo.
- [ ] Run all affected Go, client, PostgreSQL and browser tests; commit.

## Task 5: Make sorting, exports, calendar and controls consistent

- [ ] Add failing tests for global sorting, SQL sort allowlist, stable null ordering, export limits/snapshot, cancellation after workbook generation, accessible sorting/camera controls, and Caracas calendar dates under UTC and UTC+14.
- [ ] Add allowlisted global sorting in PostgreSQL for dates, status and company; retain encrypted-name lookup and remove misleading page-local name sorting.
- [ ] Add authenticated `GET /api/v1/visits/export` with the existing filters/sort and format `pdf|xlsx`. Count and read data in a read-only `REPEATABLE READ` transaction, reject totals above the existing per-format limits, return no photos, and generate files in the client after the transaction closes.
- [ ] Keep export libraries lazy-loaded; abort requests and recheck cancellation before download. Apply same limit and timezone behavior to calendar PDF.
- [ ] Use semantic keyboard-operable controls, visible focus, accessible sort state and modal focus return.
- [ ] Run relevant integration, report round-trip and browser tests; commit.

## Task 6: Stream and version large encrypted backups; separate database roles

- [ ] Add backup tests first for old/new format reads, multi-GiB streaming, tamper/truncation, wrong passphrase, insufficient disk, concurrent operations, retention, and atomic restore rollback.
- [ ] Add `filippo.io/age` v1.3.2. Version new backups and use authenticated streaming encryption with per-backup random passphrases; keep decryption for the existing format.
- [ ] Stream `pg_dump` through encryption to a private temporary file; verify complete authentication and archive structure before transactional restore. Bound new archive size to 20 GiB and rendered SQL to 80 GiB.
- [ ] Serialize create, prepare, remove, prune and restore once per top-level operation; only prune after verifying a new successful backup and keep 30 verified copies. Record failures, duration, size and last successful status.
- [ ] Split PostgreSQL runtime, backup and maintenance accounts; grant only required privileges. Remove password-storage volume from API service.
- [ ] Run backup/restore CI against disposable PostgreSQL, including old format and rollback fault injection; commit.

## Task 7: Validate full-stack load using representative fictitious data

- [ ] Extend deterministic fixtures to 100,000 visitors, 1,000,000 visits, anonymized/cancelled records, frequent names and 75/5,000 open-visit scenarios.
- [ ] Generate non-identifying images at representative sizes: 10% profiles with 128–256 KiB photos and 5% with 256–512 KiB documents.
- [ ] Add a 50-session HTTP workload through TLS/Nginx/Next/BFF/cookies/renewal plus five concurrent browser journeys; warm for 2 minutes and measure for 15 minutes.
- [ ] Run manually in Linux CI/lab only after confirming at least 4 vCPU, 16 GiB RAM and 512 GiB disk. Fail before data creation when resources are insufficient.
- [ ] Record p95 by operation (ordinary ≤1s, search ≤2s) and unexpected errors (<1%). Keep API-only results separate; paginate operational open lists if the 5,000-open case misses targets.
- [ ] Commit harness and workflow after its reproducible run.

## Task 8: Close documentation and operational readiness

- [ ] Correct current manuals/API docs for password and image limits, roles, privacy screens, cancellation, Next recovery route, export limits and backup formats; preserve historical migration notes as historical.
- [ ] Document install, upgrade, rollback, backup/restore, stale-lock recovery, key custody, alerts and cancellation-after-backup review. Set provisional lab targets RPO 24 hours / RTO 2 hours, explicitly awaiting business approval.
- [ ] Record remaining enterprise prerequisites: server/hostname/trusted TLS, firewall, external SMTP, retention policy, operating owners and operator acceptance.
- [ ] Run clean Compose install, browser journeys, backup/restore rehearsal, restart/persistence checks and the complete verification matrix; update operational evidence and commit.

## Interfaces and acceptance

- `POST /api/v1/auth/logout` performs account-wide revocation; token claims carry immutable session start and absolute expiration.
- `POST /api/v1/visits/:id/cancel` accepts a bounded reason and succeeds only for a waiting visit.
- `GET /api/v1/visits/export?format=pdf|xlsx` returns a bounded, consistent visit snapshot for client-side generation.
- Existing `{ success, data, error }` envelope and ordinary visit query routes remain compatible. New migrations are incremental and never run at normal startup.
- Completion requires all eight tasks, their tests and commits, a full-branch review, and clear separation of laboratory evidence from enterprise acceptance.
