/**
 * Test users for E2E suites.
 *
 * Credentials come from the seed passwords defined in `.env` / `.env.example`
 * (SEED_*_PASSWORD) and the seeder at server/src/utils/seeder.ts.
 *
 * IMPORTANT: The actual `.env` must set every SEED_*_PASSWORD used below for
 * these credentials to work against a running server. See e2e/README.md.
 *
 * TODO: Confirm the exact seed passwords match the running environment before
 * executing the suites. Defaults below mirror `.env.example`.
 */

export interface TestUser {
  username: string;
  password: string;
  role: 'root' | 'admin' | 'operador' | 'auditor' | 'demo';
}

/** Superadmin (root) — platform console only. */
export const trebolmaster: TestUser = {
  username: 'trebolmaster',
  password: process.env.SEED_ROOT_PASSWORD ?? 'TrebolMaster2026!',
  role: 'root',
};

/** Tenant admin — admin console. */
export const admin: TestUser = {
  username: 'Admin',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123*',
  role: 'admin',
};

/** Operator / guard — system (guard) console. */
export const operador: TestUser = {
  username: 'operador',
  password: process.env.SEED_OPERADOR_PASSWORD ?? 'Operador2026!',
  role: 'operador',
};

/** Guard user (role operador) — system console. */
export const guard: TestUser = {
  username: 'guard',
  password: process.env.SEED_GUARD_PASSWORD ?? 'Guard2026!@#',
  role: 'operador',
};

/** Auditor — auditor console. */
export const auditor: TestUser = {
  username: 'auditor',
  password: process.env.SEED_AUDITOR_PASSWORD ?? 'Audit2026!@#',
  role: 'auditor',
};

/** Demo user — system console guided tour. */
export const demo: TestUser = {
  username: 'demo',
  password: process.env.SEED_DEMO_PASSWORD ?? 'Demo123!@#',
  role: 'demo',
};

/** Default tenant slug created by the seeder. */
export const DEFAULT_TENANT_SLUG = 'default';
