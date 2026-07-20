/**
 * Test helper: generate JWT tokens for test users using the real config.jwtSecret.
 * Tokens mirror the payload shape produced by JwtAuthService so the verifyToken
 * middleware accepts them.
 */
import jwt from 'jsonwebtoken';
import config from '../../config/AppConfig';
import type { AuthPayload } from '../../types/express';

export interface TestUserSpec {
  id: number;
  username: string;
  email?: string | null;
  tenantId?: number;
  tenantSlug?: string;
  role?: string;
}

export const makeToken = (spec: TestUserSpec): string => {
  const payload: AuthPayload = {
    id: spec.id,
    username: spec.username,
    email: spec.email,
    tid: spec.tenantId,
    tslug: spec.tenantSlug,
    role: spec.role,
  };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });
};

export const makeRefreshToken = (spec: TestUserSpec): string => {
  const payload: AuthPayload = {
    id: spec.id,
    username: spec.username,
    email: spec.email,
  };
  return jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: '7d' });
};

// ── Pre-built token fixtures ──────────────────────────────────────
export const TENANT_A = { id: 101, slug: 'tenant-a' };
export const TENANT_B = { id: 202, slug: 'tenant-b' };

export const tenantAdminToken = (tenant: { id: number; slug: string } = TENANT_A): string =>
  makeToken({ id: 1, username: 'admin-a', email: 'admin@tenant-a.com', tenantId: tenant.id, tenantSlug: tenant.slug, role: 'admin' });

export const tenantAuditorToken = (tenant: { id: number; slug: string } = TENANT_A): string =>
  makeToken({ id: 2, username: 'auditor-a', email: 'auditor@tenant-a.com', tenantId: tenant.id, tenantSlug: tenant.slug, role: 'auditor' });

export const tenantBAdminToken = (): string =>
  makeToken({ id: 3, username: 'admin-b', email: 'admin@tenant-b.com', tenantId: TENANT_B.id, tenantSlug: TENANT_B.slug, role: 'admin' });

export const superadminToken = (): string =>
  makeToken({ id: 99, username: 'root', email: 'root@platform.com', tenantId: 0, tenantSlug: '', role: 'root' });

export const tenantAgnosticToken = (): string =>
  makeToken({ id: 1, username: 'admin-a', email: 'admin@tenant-a.com', tenantId: 0, tenantSlug: '', role: 'admin' });
