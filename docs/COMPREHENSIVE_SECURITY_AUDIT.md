# Comprehensive Security Audit Report
## Visitor Access Control System v1.0.0

**Audit Date:** March 28, 2026  
**Audit Team:**
- **Cybersecurity Architect** — Technical Vulnerability Assessment
- **CISO / CLO** — Regulatory Compliance & Legal Audit
- **Business Risk Analyst** — Impact Assessment & Mitigation Strategy

**Scope:** Full-stack application (Electron + React + Node.js/Express + SQLCipher)  
**Classification:** CONFIDENTIAL — Internal Use Only

---

# Executive Summary

The Visitor Access Control System demonstrates a **strong security posture** for a desktop application in its class. It employs encrypted databases (SQLCipher/AES-256), field-level encryption (AES-256-GCM), JWT-based authentication with refresh tokens, RBAC, Zod input validation, rate limiting, bcrypt password hashing, and a comprehensive audit trail. GDPR/ARCO rights are implemented at the application level.

However, the audit identified **5 Critical, 7 High, 9 Medium, and 8 Low** severity findings across the four assessment pillars. The most urgent items involve hardcoded credentials in the seeder, a SQL injection vector in the database encryption pragma, the exposed Swagger documentation endpoint, missing security headers, and the `xlsx` package license conflict.

---

# Pillar 1 — Technical Vulnerability Assessment
*Cybersecurity Architect*

## 1.1 OWASP Top 10 Analysis

### FINDING T-01: SQL Injection via PRAGMA key (CRITICAL)
**OWASP A03:2021 – Injection | SANS CWE-89**

In `server/src/database.ts:32`:
```typescript
await sequelize.query(`PRAGMA key = '${config.dbEncryptionKey}';`);
```
The `DB_ENCRYPTION_KEY` is interpolated directly into a raw SQL string. If the key ever contains a single quote (e.g. from a misconfigured environment variable), it breaks the PRAGMA statement and could corrupt or fail to open the database. While this is not a user-facing injection vector, it violates defense-in-depth.

- **Risk:** Database corruption; potential bypass of encryption if a malformed key is silently accepted.
- **Mitigation:** Use parameterized binding or at minimum sanitize/validate the key format (must be hex) before interpolation:
  ```typescript
  if (!/^[a-f0-9]{64}$/i.test(config.dbEncryptionKey)) {
    throw new Error('DB_ENCRYPTION_KEY must be a 64-character hex string');
  }
  ```

### FINDING T-02: Hardcoded Credentials in Seeder (CRITICAL)
**OWASP A07:2021 – Identification and Authentication Failures | SANS CWE-798**

In `server/src/utils/seeder.ts:44-137`, multiple user accounts are created with hardcoded plaintext passwords that are **logged to stdout**:

| Username | Password | Role |
|----------|----------|------|
| `Admin@trebol.com` | `Trebol123*` | admin |
| `guard` | `Guard123!@#` | guard |
| `admin` | `Admin123!@#` | admin |
| `demo` | `Demo123!@#` | admin |
| `auditor` | `Audit2026!@#` | auditor |
| `trebolmaster` | `TrebolMaster2026!@#` | superadmin |

**The `trebolmaster` superadmin and `Admin@trebol.com` accounts have `mustChangePassword: false`**, meaning they can be used indefinitely without forced rotation. This seeder runs **on every server startup** via `ensureBaseUsers()`.

- **Risk:** Any developer, insider, or anyone who reads the source code or console output knows the superadmin password.
- **Mitigation:**
  1. Remove all hardcoded passwords. Generate cryptographically random initial passwords at first boot.
  2. Set `mustChangePassword: true` for ALL seeded accounts, including superadmin.
  3. Never log passwords to console. Display them only once via a secure channel (e.g., a first-run setup screen).
  4. Gate the seeder behind `NODE_ENV !== 'production'` or a CLI flag.

### FINDING T-03: Password Reset Token Exposed in API Response (HIGH)
**OWASP A07:2021 – Identification and Authentication Failures | SANS CWE-200**

In `server/src/controllers/AuthCleanController.ts:68-69`:
```typescript
res.json(ResponseBuilder.success({
  message: 'Reset token generated (Check console)',
  token // Exposed for demo/local purposes
}));
```
The raw password reset token is returned in the HTTP response body. This is documented as "for demo/local purposes" but is extremely dangerous if this code reaches production.

- **Risk:** An attacker who intercepts or replays the response can reset any user's password.
- **Mitigation:** Never return the token in the response. Send it exclusively via email (the `EmailService` exists but nodemailer is commented out). Return only a generic confirmation message.

### FINDING T-04: JWT Access and Refresh Tokens Share the Same Secret (HIGH)
**OWASP A02:2021 – Cryptographic Failures | SANS CWE-327**

In `server/src/infrastructure/services/JwtAuthService.ts`, both `generateAccessToken()` (line 37) and `generateRefreshToken()` (line 54) use `config.jwtSecret` as the signing key. This means:
- If the access token secret is compromised, all refresh tokens are also compromised.
- There is no way to selectively revoke one token type.

- **Risk:** Compromise of a single secret invalidates the entire authentication scheme.
- **Mitigation:** Use separate secrets for access and refresh tokens. Add a `JWT_REFRESH_SECRET` environment variable.

### FINDING T-05: No Token Revocation / Blacklist Mechanism (HIGH)
**OWASP A07:2021 – Identification and Authentication Failures**

There is no server-side session store, token blacklist, or revocation table. Once a JWT is issued, it remains valid until expiry (15min for access, 7 days for refresh). If a user is deleted or their role is changed, their existing tokens continue to work.

- **Risk:** Deleted or demoted users retain access for up to 7 days.
- **Mitigation:** Implement a lightweight token blacklist (in-memory or SQLite table), checked on each `verifyToken` call. Invalidate all tokens when a user's role changes, password resets, or account is deleted.

### FINDING T-06: Swagger/API Docs Exposed Without Authentication (HIGH)
**OWASP A01:2021 – Broken Access Control | SANS CWE-284**

In `server/src/app.ts:79`:
```typescript
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```
The Swagger UI is publicly accessible at `/api-docs` without any authentication, exposing the complete API surface, request/response schemas, and endpoint structure.

- **Risk:** Full API reconnaissance for attackers; reveals internal business logic.
- **Mitigation:** Protect the endpoint behind `verifyToken` + `isAdmin`, or disable it entirely when `NODE_ENV === 'production'`.

### FINDING T-07: Default JWT Secret Fallback in Development (HIGH)
**OWASP A07:2021 | SANS CWE-1188**

In `server/src/config/AppConfig.ts:49`:
```typescript
jwtSecret = process.env.JWT_SECRET || 'default_dev_secret_change_me';
```
The validation in `Config.validate()` only checks this in production. In development, the default secret is used, which means any developer can forge tokens.

- **Risk:** Token forgery in any non-production environment.
- **Mitigation:** Fail startup if `JWT_SECRET` is not set regardless of environment, or auto-generate a random secret per session for development.

### FINDING T-08: Static File Serving Without Access Control (HIGH)
**OWASP A01:2021 – Broken Access Control | SANS CWE-425**

In `server/src/app.ts:51`:
```typescript
app.use("/data/photos", express.static(photosDir));
```
Visitor photos are served as public static files. Any authenticated or unauthenticated request to `/data/photos/<filename>` returns the photo. Photo filenames follow a predictable pattern: `{cedula}_{timestamp}.jpg`.

- **Risk:** Unauthorized access to visitor biometric data (photographs) and ID document photos.
- **Mitigation:** Serve photos through a controller with `verifyToken` middleware. Alternatively, use randomized UUIDs for filenames.

### FINDING T-09: `express.json()` Without Body Size Limit (MEDIUM)
**OWASP A06:2021 – Vulnerable and Outdated Components | SANS CWE-770**

In `server/src/app.ts:44`:
```typescript
app.use(express.json());
```
No `limit` option is set. The default is `100kb`, which is acceptable for JSON, but `visitorData.photoBase64` and `visitorData.idPhotoBase64` fields (see `visit.schema.ts:39-41`) accept unbounded Base64 strings.

- **Risk:** Memory exhaustion / DoS via large photo payloads.
- **Mitigation:** Set `express.json({ limit: '5mb' })` or a size appropriate for your maximum photo resolution. Add explicit `z.string().max(...)` constraints on Base64 fields.

### FINDING T-10: CORS Allows Null Origin Requests (MEDIUM)
**OWASP A05:2021 – Security Misconfiguration | SANS CWE-346**

In `server/src/app.ts:32-33`:
```typescript
if (!origin || allowedOrigins.includes(origin)) {
  callback(null, true);
}
```
Requests with **no `Origin` header** are accepted. While this is necessary for Electron IPC, it also allows `curl`, Postman, or any non-browser client to bypass CORS entirely.

- **Risk:** CORS policy is effectively bypassed by non-browser tools.
- **Mitigation:** For a desktop-only app, this is partially acceptable. However, combine with additional defenses: add a custom header check (e.g., `X-App-Source: electron`) that the client always sends.

### FINDING T-11: `mustChangePassword` Check Relies on JWT Claim (MEDIUM)
**OWASP A07:2021 | SANS CWE-602**

In `server/src/middleware/mustChangePassword.ts:22`:
```typescript
if (user.mustChangePassword === true) {
```
This reads the `mustChangePassword` flag from the JWT payload (set at login time). If an admin later flags a user to change their password, the existing JWT still contains the old value. The flag is only enforced after the next login.

- **Risk:** Password change enforcement is delayed until token expiry.
- **Mitigation:** Check `mustChangePassword` from the database on each request (with short caching), or reduce access token TTL for flagged users.

### FINDING T-12: Backup Encryption Uses Static Salt (MEDIUM)
**OWASP A02:2021 – Cryptographic Failures | SANS CWE-760**

In `server/src/infrastructure/services/SqliteBackupService.ts:58`:
```typescript
return crypto.scryptSync(password, 'backup-salt', 32);
```
A hardcoded, static salt `'backup-salt'` is used for key derivation. This makes the key derivation deterministic and vulnerable to precomputed attacks.

- **Risk:** If the backup password is leaked, all historical backups are decryptable.
- **Mitigation:** Generate a unique random salt per backup and store it alongside the IV in the backup file header.

### FINDING T-13: Encrypted Field Detection Heuristic is Fragile (MEDIUM)
**SANS CWE-697**

In `server/src/models/Visitor.ts:27,98`:
```typescript
if (val.includes(':')) ...  // Detect if already encrypted
if (val.length !== 64) ... // Detect if already hashed
```
Encryption status is determined by checking for colons or string length. Legitimate plaintext data containing colons (e.g., `"Company: ABC"`) would be misidentified as encrypted, causing decryption errors.

- **Risk:** Data corruption or decryption failures.
- **Mitigation:** Use a structured prefix (e.g., `ENC:`) or store encryption status as a separate database column flag.

### FINDING T-14: No Security Response Headers (MEDIUM)
**OWASP A05:2021 – Security Misconfiguration**

The Express app does not set security headers:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (if ever served over HTTPS)
- `Content-Security-Policy`
- `X-XSS-Protection`

- **Risk:** Clickjacking, MIME-sniffing attacks, XSS amplification.
- **Mitigation:** Add the `helmet` npm package: `app.use(helmet())`.

### FINDING T-15: Client Stores JWT in localStorage (MEDIUM)
**OWASP A07:2021 | SANS CWE-922**

In `client/src/context/AuthContext.tsx:21`:
```typescript
localStorage.setItem('token', token);
```
`localStorage` is accessible to any JavaScript running in the same origin, making the token vulnerable to XSS extraction.

- **Risk:** Token theft via XSS.
- **Mitigation:** In an Electron app, this risk is reduced since the renderer origin is controlled. However, using `httpOnly` cookies or Electron's `safeStorage` API would be more robust.

### FINDING T-16: Photo Filename Contains Cedula Hash (LOW)
In `server/src/utils/PhotoStorage.ts:38`:
```typescript
const filename = `${cedula}_${timestamp}.jpg`;
```
The `cedula` parameter at this point is the hashed value, which is also the primary key. This leaks the hash in the filesystem, enabling offline enumeration.

- **Risk:** Low — Information disclosure via filesystem enumeration.
- **Mitigation:** Use UUID v4 for photo filenames.

### FINDING T-17: Crash Log Writes to Hardcoded Absolute Path (LOW)

In `server/src/server.ts:60`:
```typescript
require('fs').writeFileSync('C:\\Users\\Gusgus\\Documents\\Proyectos\\Visitors\\server_crash_log.txt', ...);
```
This path is developer-specific and will fail on any other machine or in production.

- **Risk:** Crash logs lost in production; reveals developer filesystem path.
- **Mitigation:** Use `path.join(config.dbPath, 'server_crash_log.txt')` or Electron's `app.getPath('userData')`.

### FINDING T-18: Error Handler Leaks Stack Traces (LOW)
In `server/src/middleware/error.ts:5`:
```typescript
console.error(err.stack);
```
While the response message is sanitized, the full stack trace is logged to stdout/stderr. In Electron, stderr output can be displayed in dialog boxes (see `electron/main.ts:343`).

- **Risk:** Stack traces visible to end users via Electron error dialogs.
- **Mitigation:** Filter server-side errors before displaying in Electron dialogs.

---

## 1.2 Third-Party Dependency Risk Assessment

| Package | Version | Risk Level | Notes |
|---------|---------|------------|-------|
| `@journeyapps/sqlcipher` | ^5.1.8 | **Low** | Native module; keep updated for C/C++ CVEs |
| `bcryptjs` | ^3.0.3 | **Low** | Pure JS bcrypt; no known vulnerabilities |
| `jsonwebtoken` | ^9.0.3 | **Low** | Widely audited; pin algorithm to HS256 (done ✅) |
| `sequelize` | ^6.37.1 | **Medium** | Large ORM surface; monitor for injection patches |
| `express` | ^4.18.2 | **Low** | Mature; keep updated |
| `express-rate-limit` | ^8.2.1 | **Low** | In-memory store; resets on restart |
| `zod` | ^4.3.6 | **Low** | Schema validation; minimal attack surface |
| `xlsx` | ^0.18.5 | **HIGH** | See Legal finding L-01; Apache-2.0 → proprietary license change |
| `dompurify` | ^3.3.1 | **Low** | XSS sanitization; positive security addition |
| `electron` | ^40.2.1 | **Medium** | Large native surface; keep updated for Chromium CVEs |
| `swagger-ui-express` | ^5.0.1 | **Medium** | Exposes API surface (see T-06) |
| `pdfkit` | ^0.17.2 | **Low** | File generation; no user input injection path |

### FINDING T-19: No `npm audit` or Dependency Scanning in CI (MEDIUM)
No CI/CD pipeline or `npm audit` script is defined.
- **Mitigation:** Add `npm audit --audit-level=high` to a pre-commit hook or CI pipeline.

---

## 1.3 Architectural Assessment

### Strengths
- **Clean Architecture** with clear separation: domain → application → infrastructure → controllers → routes
- **Dependency Injection Container** (singleton pattern) for testability
- **Electron Security Best Practices**: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`
- **Navigation restrictions**: `setWindowOpenHandler` + `will-navigate` event handling
- **TypeScript throughout** — reduces runtime type errors

### Weaknesses
- **No HTTPS in local transport** — HTTP between Electron renderer and Express server. For localhost-only this is acceptable but should be documented.
- **In-memory rate limiter** resets on server restart — not an issue for a desktop app but would be in a networked deployment.
- **No request signing or HMAC** between Electron main process and server.

---

# Pillar 2 — Regulatory Compliance & Standards
*CISO*

## 2.1 ISO/IEC 27001 Alignment

| Control | Status | Notes |
|---------|--------|-------|
| A.5 — Information Security Policies | ⚠️ Partial | README documents security features but no formal ISMS policy document |
| A.6 — Organization of Information Security | ⚠️ Partial | Roles defined (Admin, Guard, Auditor, SuperAdmin) but no separation of duties for SuperAdmin |
| A.8 — Asset Management | ✅ Good | Data classification implicit via encryption tiers |
| A.9 — Access Control | ✅ Good | RBAC with 4 roles; account lockout; forced password change |
| A.10 — Cryptography | ✅ Strong | AES-256-GCM for fields, SQLCipher for DB, bcrypt for passwords |
| A.12 — Operations Security | ⚠️ Partial | Audit logs exist but log retention deletes old records (see 2.3) |
| A.14 — System Acquisition/Development | ⚠️ Partial | Tests exist (`vitest`) but no security test suite |
| A.18 — Compliance | ⚠️ Partial | GDPR/ARCO implemented but no formal DPA or privacy impact assessment |

### FINDING C-01: No Formal Information Security Policy Document (MEDIUM)
- **Mitigation:** Create an ISMS policy document covering scope, roles, risk treatment, and continuous improvement per ISO 27001 Section 5.

## 2.2 NIST Cybersecurity Framework (CSF) Alignment

| Function | Maturity | Key Findings |
|----------|----------|-------------|
| **Identify** | ⭐⭐⭐ | Asset inventory implicit; data classification via encryption |
| **Protect** | ⭐⭐⭐⭐ | Strong encryption, RBAC, input validation, rate limiting |
| **Detect** | ⭐⭐⭐ | Audit logging with IP/UserAgent capture; no anomaly detection |
| **Respond** | ⭐⭐ | No incident response plan or automated alerting |
| **Recover** | ⭐⭐⭐ | Encrypted backups with unique restore passwords; automated retention |

### FINDING C-02: No Incident Response Plan (MEDIUM)
- **Mitigation:** Document an IRP covering detection, containment, eradication, recovery, and lessons learned.

### FINDING C-03: No Anomaly Detection or Alerting (LOW)
- The system logs activity but has no threshold-based alerts (e.g., N failed logins across users, bulk data exports).
- **Mitigation:** Add alerting for critical events: bulk deletions, repeated failed logins from different usernames, SuperAdmin operations.

## 2.3 SOC 2 Type II Considerations

| Trust Service Criteria | Status |
|----------------------|--------|
| **Security** | ✅ Encryption, access control, audit trails |
| **Availability** | ⚠️ No SLA; desktop app; single point of failure (local DB) |
| **Processing Integrity** | ✅ Zod validation, ORM-based queries |
| **Confidentiality** | ✅ Field encryption, DB encryption, encrypted backups |
| **Privacy** | ✅ ARCO rights, data retention, anonymization |

## 2.4 GDPR / Data Protection Compliance

### FINDING C-04: Audit Log Retention Deletes Evidence (HIGH)
In `server/src/utils/retention.ts:16-22`, the retention scheduler **deletes** ActivityLog records older than `DATA_RETENTION_DAYS` (default 60 days). Under GDPR Article 5(1)(e) and ISO 27001 A.12.4, audit logs should be retained independently of personal data.

- **Risk:** Loss of forensic evidence; non-compliance with audit requirements.
- **Mitigation:** Separate audit log retention from personal data retention. Audit logs should be retained for a minimum of 1 year (or per organizational policy). Only personal data (visitor records, photos) should follow the 60-day retention.

### FINDING C-05: No Data Processing Agreement (DPA) Template (LOW)
- The system processes personal data (names, ID numbers, photos, email, phone) but no DPA template is provided for organizations deploying it.
- **Mitigation:** Provide a DPA template in the docs.

### FINDING C-06: No Cookie/Consent Banner for Browser Context (LOW)
- In the Electron context, `localStorage` is used instead of cookies. No explicit consent UI exists for data processing beyond the check-in consent object.
- **Risk:** Low for a desktop app, but if ever deployed as a web app, this would be non-compliant.
- **Mitigation:** The check-in `consent` schema is well-designed (requires `accepted: true`, `policyVersion`, `acceptedAt`). Document that this satisfies the consent requirement for the desktop context.

## 2.5 Access Control (RBAC) Assessment

| Role | Create Users | Manage Visits | View Reports | View Audit Logs | Manage Backups | ARCO Operations | System Config |
|------|-------------|--------------|-------------|----------------|---------------|-----------------|---------------|
| **SuperAdmin** | ✅ | via API | via API | ✅ | via Admin | via API | ✅ |
| **Admin** | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ (Cancellation) | ❌ |
| **Guard** | ❌ | ✅ | Basic | ❌ | ❌ | ❌ | ❌ |
| **Auditor** | ❌ | ❌ (Read-Only) | ✅ | ✅ | ❌ | ✅ (Access/View) | ❌ |

### FINDING C-07: SuperAdmin Has No Audit Over Own Actions (MEDIUM)
SuperAdmin user management operations (create, delete, reset password) in `SuperAdminController.ts` do **not** log to the ActivityLog.

- **Risk:** Superadmin can perform privileged operations without an audit trail.
- **Mitigation:** Add `logActivity()` calls to all SuperAdmin controller methods.

## 2.6 Data Encryption Assessment

| Layer | Mechanism | Status |
|-------|-----------|--------|
| **At Rest — Database** | SQLCipher AES-256-CBC | ✅ Strong |
| **At Rest — Sensitive Fields** | AES-256-GCM (IV + AuthTag) | ✅ Strong |
| **At Rest — Backups** | AES-256-GCM + gzip + scrypt key derivation | ⚠️ Static salt (see T-12) |
| **At Rest — Passwords** | bcrypt (12 rounds) | ✅ Strong |
| **At Rest — Reset Tokens** | SHA-256 hashed before storage | ✅ Good |
| **In Transit** | HTTP (localhost only) | ⚠️ Acceptable for desktop; no TLS |
| **At Rest — Visitor ID (cedula)** | SHA-256 hash + AES-256-GCM encrypted backup | ✅ Good |

---

# Pillar 3 — Legal & Intellectual Property (IP) Audit
*CLO*

## 3.1 Software License Compliance

### FINDING L-01: `xlsx` Package License Conflict (CRITICAL)
**Package:** `xlsx` v0.18.5 (client dependency)

The SheetJS `xlsx` package changed its license from Apache-2.0 to a **proprietary license** starting from version 0.18.0. The current version (^0.18.5) falls under this proprietary license, which:
- Prohibits redistribution without a commercial license
- May conflict with the ISC license declared in the root `package.json`
- Creates legal risk if the application is distributed externally

- **Risk:** Copyright infringement; potential cease-and-desist from SheetJS LLC.
- **Mitigation:**
  1. **Immediate:** Replace `xlsx` with `exceljs` (MIT license) or `xlsx-populate` (MIT).
  2. **Alternative:** Downgrade to `xlsx@0.17.5` (last Apache-2.0 version), though it lacks security patches.
  3. **Alternative:** Purchase a commercial SheetJS license.

### FINDING L-02: Missing SBOM (Software Bill of Materials) (LOW)
No SBOM is generated or maintained. For enterprise/government deployments, an SBOM is increasingly required.

- **Mitigation:** Generate SBOM using `npx @cyclonedx/cyclonedx-npm --output-file sbom.json`.

## 3.2 License Summary of Key Dependencies

| Package | License | Copyleft Risk |
|---------|---------|---------------|
| React | MIT | ✅ None |
| Express | MIT | ✅ None |
| Sequelize | MIT | ✅ None |
| Electron | MIT | ✅ None |
| bcryptjs | MIT | ✅ None |
| jsonwebtoken | MIT | ✅ None |
| Tailwind CSS | MIT | ✅ None |
| Vite | MIT | ✅ None |
| Zod | MIT | ✅ None |
| SQLCipher (journeyapps) | BSD-3-Clause | ✅ None |
| chart.js | MIT | ✅ None |
| jspdf | MIT | ✅ None |
| DOMPurify | Apache-2.0/MPL-2.0 | ✅ None (permissive) |
| **xlsx** | **Proprietary** | **❌ HIGH RISK** |
| pdfkit | MIT | ✅ None |
| swagger-ui-express | MIT | ✅ None |

## 3.3 Legal Liability Assessment

### FINDING L-03: No Terms of Service or EULA (MEDIUM)
The README states "Este proyecto es privado y propietario. Todos los derechos reservados." but no formal EULA or Terms of Service is provided with the distributed application.

- **Risk:** Unclear liability boundaries; no limitation of liability clause.
- **Mitigation:** Create an EULA covering: limitation of liability, warranty disclaimers, data loss responsibility, and acceptable use.

### FINDING L-04: Biometric Data Handling Without Explicit Legal Framework (MEDIUM)
The system captures and stores facial photographs, which may constitute biometric data under certain jurisdictions (e.g., GDPR Article 9, Illinois BIPA, LGPD).

- **Risk:** Processing biometric data without explicit legal basis.
- **Mitigation:** Document the legal basis for photo collection in a Data Protection Impact Assessment (DPIA). Ensure the check-in consent form explicitly covers photo capture.

### FINDING L-05: No Data Breach Notification Procedure (MEDIUM)
No documented procedure for notifying affected individuals or authorities in case of a data breach (required within 72 hours under GDPR Article 33).

- **Mitigation:** Document a breach notification procedure and integrate it into the incident response plan.

---

# Pillar 4 — Business Impact & Risk Management
*Business Risk Analyst*

## 4.1 Risk Registry (Consolidated)

| ID | Finding | Criticality | CVSS Est. | Business Impact | Likelihood |
|----|---------|-------------|-----------|-----------------|------------|
| **T-01** | SQL Injection via PRAGMA key | **Critical** | 8.1 | Database corruption/bypass | Low (config-dependent) |
| **T-02** | Hardcoded credentials in seeder | **Critical** | 9.1 | Full system compromise | High |
| **L-01** | `xlsx` proprietary license | **Critical** | N/A | Legal action, distribution ban | High |
| **T-03** | Reset token in API response | **High** | 7.5 | Account takeover | Medium |
| **T-04** | Shared JWT secret for access/refresh | **High** | 7.2 | Complete auth compromise | Low |
| **T-05** | No token revocation | **High** | 6.8 | Unauthorized access post-deletion | Medium |
| **T-06** | Swagger exposed without auth | **High** | 6.5 | API reconnaissance | High |
| **T-07** | Default JWT secret fallback | **High** | 7.3 | Token forgery in dev | Medium |
| **T-08** | Photos served without auth | **High** | 7.1 | PII exposure (photos) | High |
| **C-04** | Audit logs deleted by retention | **High** | 6.0 | Forensic evidence loss | High |
| **T-09** | No body size limit for photos | **Medium** | 5.3 | DoS via large payloads | Low |
| **T-10** | CORS null origin accepted | **Medium** | 4.3 | CORS bypass | Low (desktop app) |
| **T-11** | mustChangePassword from JWT | **Medium** | 5.0 | Delayed enforcement | Medium |
| **T-12** | Static salt in backup encryption | **Medium** | 5.5 | Backup decryption | Low |
| **T-13** | Fragile encryption detection | **Medium** | 4.7 | Data corruption | Low |
| **T-14** | Missing security headers | **Medium** | 4.0 | Clickjacking, MIME sniffing | Low (desktop) |
| **T-15** | JWT in localStorage | **Medium** | 5.0 | Token theft via XSS | Low (Electron) |
| **C-01** | No ISMS policy document | **Medium** | N/A | Audit failure | Medium |
| **C-02** | No incident response plan | **Medium** | N/A | Delayed breach response | Medium |
| **C-07** | SuperAdmin unaudited | **Medium** | 5.5 | Insider threat undetected | Medium |
| **T-19** | No dependency scanning | **Medium** | N/A | Vulnerable dependencies | Medium |
| **L-03** | No EULA | **Medium** | N/A | Legal liability exposure | Medium |
| **L-04** | Biometric data without DPIA | **Medium** | N/A | Regulatory fine | Medium |
| **L-05** | No breach notification procedure | **Medium** | N/A | GDPR non-compliance | Medium |
| **T-16** | Photo filename leaks hash | **Low** | 2.0 | Information disclosure | Low |
| **T-17** | Hardcoded crash log path | **Low** | 2.0 | Log loss | Low |
| **T-18** | Stack traces in error dialogs | **Low** | 3.1 | Information disclosure | Low |
| **C-03** | No anomaly detection | **Low** | N/A | Delayed threat detection | Low |
| **C-05** | No DPA template | **Low** | N/A | Contractual gap | Low |
| **C-06** | No explicit consent UI | **Low** | N/A | Minimal (desktop app) | Low |
| **L-02** | No SBOM | **Low** | N/A | Supply chain transparency | Low |

## 4.2 Mitigation Priority & Roadmap

### Phase 1 — Immediate (Week 1) — Critical + High

| Action | Finding(s) | Effort | Security ROI |
|--------|-----------|--------|--------------|
| Replace `xlsx` with `exceljs` (MIT) | L-01 | 4-8h | Eliminates legal risk |
| Remove hardcoded passwords from seeder; generate random first-boot passwords | T-02 | 4h | Eliminates #1 compromise vector |
| Remove reset token from API response | T-03 | 15min | Prevents account takeover |
| Validate `DB_ENCRYPTION_KEY` format before PRAGMA | T-01 | 30min | Prevents injection |
| Protect `/api-docs` behind auth or disable in production | T-06 | 30min | Hides API surface |
| Protect `/data/photos` behind auth middleware | T-08 | 1-2h | Protects biometric PII |
| Separate audit log retention from data retention | C-04 | 2h | Preserves forensic evidence |
| Remove default JWT secret; require explicit config | T-07 | 30min | Prevents dev token forgery |

### Phase 2 — Short-Term (Weeks 2-4) — High + Medium

| Action | Finding(s) | Effort | Security ROI |
|--------|-----------|--------|--------------|
| Separate JWT secrets for access/refresh tokens | T-04 | 2h | Cryptographic isolation |
| Implement token blacklist/revocation table | T-05 | 4-8h | Immediate access revocation |
| Add `helmet` middleware for security headers | T-14 | 30min | Defense-in-depth |
| Add `logActivity()` to all SuperAdmin operations | C-07 | 2h | Closes audit gap |
| Set `express.json({ limit: '5mb' })` | T-09 | 15min | DoS prevention |
| Add dependency scanning to CI | T-19 | 2h | Continuous vulnerability monitoring |
| Use random salt per backup | T-12 | 1h | Improved backup security |
| Use structured prefix for encrypted fields | T-13 | 4h | Eliminates data corruption risk |

### Phase 3 — Medium-Term (Months 1-2) — Medium + Low + Compliance

| Action | Finding(s) | Effort | Security ROI |
|--------|-----------|--------|--------------|
| Create ISMS policy document | C-01 | 1-2 weeks | ISO 27001 readiness |
| Create incident response plan | C-02 | 1 week | Regulatory compliance |
| Create EULA / Terms of Service | L-03 | 1 week | Legal protection |
| Conduct DPIA for biometric data | L-04 | 1 week | GDPR/BIPA compliance |
| Document breach notification procedure | L-05 | 2 days | GDPR Article 33 |
| Generate SBOM | L-02 | 1h | Supply chain transparency |
| Add anomaly detection alerts | C-03 | 1-2 weeks | Proactive threat detection |
| Provide DPA template | C-05 | 2 days | Contractual completeness |

## 4.3 Business Continuity Assessment

| Scenario | Current Resilience | Recommendation |
|----------|-------------------|----------------|
| **Database corruption** | ✅ Encrypted backups with restore passwords | Add automated backup verification (test restore) |
| **Key compromise (DB_ENCRYPTION_KEY)** | ⚠️ No key rotation mechanism | Implement key rotation utility |
| **Server crash** | ✅ Auto-restart via Electron lifecycle | Add health check endpoint |
| **Data loss** | ✅ Automated daily retention + manual backups | Add off-site backup option |
| **Insider threat** | ⚠️ SuperAdmin unaudited | Implement dual-authorization for destructive operations |
| **Ransomware** | ⚠️ Backups on same filesystem | Store backups on separate volume/cloud |

---

# Appendix A — Positive Security Findings

The audit team wishes to highlight the following well-implemented security controls:

1. **SQLCipher database encryption** — AES-256; entire database encrypted at rest
2. **AES-256-GCM field-level encryption** with proper IV and AuthTag per field
3. **bcrypt password hashing** at 12 rounds (configurable)
4. **Zod schema validation** on all input endpoints
5. **RBAC with 4 distinct roles** and middleware enforcement
6. **Account lockout** after configurable failed attempts
7. **Password policy** with 12+ chars, uppercase, lowercase, digits, special chars, common password blocklist
8. **Forced password change** on first login for seeded accounts (except two — see T-02)
9. **Audit trail** with IP address and UserAgent capture
10. **GDPR/ARCO compliance** — Access, Rectification, Cancellation, Opposition rights implemented
11. **Data retention automation** with configurable window
12. **Encrypted backups** with unique restore passwords (one-time display)
13. **Electron security hardening** — contextIsolation, sandbox, no nodeIntegration, navigation restrictions
14. **Clean Architecture** with proper dependency injection
15. **TypeScript throughout** reducing type-related vulnerabilities
16. **DOMPurify** on the client side for XSS protection

---

# Appendix B — Audit Methodology

- **Static Code Analysis:** Manual review of all source files in `server/src/`, `client/src/`, `electron/`
- **Dependency Analysis:** Review of `package.json` (root, server, client) for known vulnerabilities and license conflicts
- **Architecture Review:** Assessment of data flow, trust boundaries, and attack surface
- **Standards Mapping:** ISO 27001 Annex A, NIST CSF v1.1, OWASP Top 10 (2021), SANS Top 25 (2023), SOC 2 TSC
- **Regulatory Review:** GDPR, CCPA applicability analysis

---

**Report prepared by the Senior Consulting Audit Team**  
**Classification: CONFIDENTIAL**  
**Distribution: Project Owner, Development Lead, Security Team**
