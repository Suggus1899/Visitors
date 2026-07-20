/**
 * Security tests: cross-tenant access prevention.
 *
 * Uses supertest with an isolated Express app that mounts the REAL auth
 * middleware chain (verifyToken → resolveTenant → verifyTenantMembership)
 * with a mocked Container so no DB is required.
 *
 * This is the most critical security test file: it verifies that a token
 * issued for tenant A cannot access tenant B's resources.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mock the Container so middleware uses in-memory repositories ──
// vi.mock factories are hoisted above imports, so we use vi.hoisted to
// create the mock objects in a way that is also hoisted and accessible.
const { mockTenantRepo, mockTenantUserRepo, mockTokenBlacklist } = vi.hoisted(() => ({
  mockTenantRepo: {
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findAccessibleByUserId: vi.fn(),
    create: vi.fn(),
  },
  mockTenantUserRepo: {
    findMembership: vi.fn(),
    findMembershipBySlug: vi.fn(),
    findByUserIdWithTenant: vi.fn(),
    create: vi.fn(),
  },
  mockTokenBlacklist: {
    isBlacklisted: vi.fn().mockReturnValue(false),
    isTokenInvalidatedForUser: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../../shared/Container', () => ({
  container: {
    tenantRepository: mockTenantRepo,
    tenantUserRepository: mockTenantUserRepo,
    tokenBlacklist: mockTokenBlacklist,
  },
}));

// Import after mock is set up
import { verifyToken, resolveTenant, verifyTenantMembership, isSuperAdmin } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { makeToken, TENANT_A, TENANT_B, tenantAdminToken, tenantBAdminToken, tenantAuditorToken, superadminToken } from '../helpers/mockToken';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());

  const tenantContext = [verifyToken, asyncHandler(resolveTenant), asyncHandler(verifyTenantMembership)];

  // Tenant-scoped dummy routes (mirrors the real route structure)
  app.get('/api/v1/:tenantSlug/visitors', ...tenantContext, (_req, res) => res.json({ success: true, data: { tenantId: _req.tenantId } }));
  app.get('/api/v1/:tenantSlug/audit/logs', ...tenantContext, (_req, res) => res.json({ success: true }));
  app.get('/api/v1/:tenantSlug/privacy/arco-requests', ...tenantContext, (_req, res) => res.json({ success: true }));
  app.get('/api/v1/:tenantSlug/visitors/:cedula/photo', ...tenantContext, (_req, res) => res.json({ success: true }));
  app.get('/api/v1/:tenantSlug/visitors/:cedula/id-photo', ...tenantContext, (_req, res) => res.json({ success: true }));

  // Platform routes (superadmin only)
  app.get('/platform/v1/tenants', verifyToken, isSuperAdmin, (_req, res) => res.json({ success: true }));
  app.get('/platform/v1/users', verifyToken, isSuperAdmin, (_req, res) => res.json({ success: true }));
  app.get('/platform/v1/stats', verifyToken, isSuperAdmin, (_req, res) => res.json({ success: true }));

  return app;
};

let app: ReturnType<typeof buildTestApp>;

beforeAll(() => {
  app = buildTestApp();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockTokenBlacklist.isBlacklisted.mockReturnValue(false);
  mockTokenBlacklist.isTokenInvalidatedForUser.mockReturnValue(false);

  // Default: tenant A exists and is active
  mockTenantRepo.findBySlug.mockImplementation((slug: string) => {
    if (slug === TENANT_A.slug) return Promise.resolve({ id: TENANT_A.id, slug: TENANT_A.slug, name: 'Tenant A', status: 'active' });
    if (slug === TENANT_B.slug) return Promise.resolve({ id: TENANT_B.id, slug: TENANT_B.slug, name: 'Tenant B', status: 'active' });
    return Promise.resolve(null);
  });
  mockTenantRepo.findById.mockImplementation((id: number) => {
    if (id === TENANT_A.id) return Promise.resolve({ id: TENANT_A.id, slug: TENANT_A.slug, name: 'Tenant A', status: 'active' });
    if (id === TENANT_B.id) return Promise.resolve({ id: TENANT_B.id, slug: TENANT_B.slug, name: 'Tenant B', status: 'active' });
    return Promise.resolve(null);
  });

  // Default: user 1 is a member of tenant A, user 3 is a member of tenant B
  mockTenantUserRepo.findMembership.mockImplementation((userId: number, tenantId: number) => {
    if (userId === 1 && tenantId === TENANT_A.id) return Promise.resolve({ userId, tenantId, role: 'admin', isActive: true });
    if (userId === 2 && tenantId === TENANT_A.id) return Promise.resolve({ userId, tenantId, role: 'auditor', isActive: true });
    if (userId === 3 && tenantId === TENANT_B.id) return Promise.resolve({ userId, tenantId, role: 'admin', isActive: true });
    return Promise.resolve(null);
  });
});

describe('Cross-tenant access prevention', () => {
  describe('Token tenant mismatch (resolveTenant)', () => {
    it('rejects tenant A token accessing tenant B slug (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_B.slug}/visitors`)
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects tenant B token accessing tenant A slug (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/visitors`)
        .set('Authorization', `Bearer ${tenantBAdminToken()}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows tenant A token accessing tenant A slug', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/visitors`)
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tenantId).toBe(TENANT_A.id);
    });
  });

  describe('Cross-tenant audit logs', () => {
    it('tenant A user cannot GET tenant B audit logs', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_B.slug}/audit/logs`)
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      expect(res.status).toBe(403);
    });

    it('tenant A auditor can GET own tenant audit logs', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/audit/logs`)
        .set('Authorization', `Bearer ${tenantAuditorToken()}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Cross-tenant ARCO requests', () => {
    it('tenant A user cannot GET tenant B ARCO requests', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_B.slug}/privacy/arco-requests`)
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      expect(res.status).toBe(403);
    });

    it('tenant A user can GET own ARCO requests', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/privacy/arco-requests`)
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Photo endpoints', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get(`/api/v1/${TENANT_A.slug}/visitors/V-12345678/photo`);

      expect(res.status).toBe(401);
    });

    it('returns 403 with wrong-tenant token', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/visitors/V-12345678/photo`)
        .set('Authorization', `Bearer ${tenantBAdminToken()}`);

      expect(res.status).toBe(403);
    });

    it('returns 403 with wrong-tenant token on id-photo endpoint', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/visitors/V-12345678/id-photo`)
        .set('Authorization', `Bearer ${tenantBAdminToken()}`);

      expect(res.status).toBe(403);
    });

    it('allows same-tenant token on photo endpoint', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/visitors/V-12345678/photo`)
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Platform routes (superadmin only)', () => {
    it('rejects non-superadmin (tenant admin) on /platform/v1/tenants (403)', async () => {
      const res = await request(app)
        .get('/platform/v1/tenants')
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects tenant auditor on /platform/v1/users (403)', async () => {
      const res = await request(app)
        .get('/platform/v1/users')
        .set('Authorization', `Bearer ${tenantAuditorToken()}`);

      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated on /platform/v1/stats (401)', async () => {
      const res = await request(app).get('/platform/v1/stats');

      expect(res.status).toBe(401);
    });

    it('allows superadmin on /platform/v1/tenants', async () => {
      const res = await request(app)
        .get('/platform/v1/tenants')
        .set('Authorization', `Bearer ${superadminToken()}`);

      expect(res.status).toBe(200);
    });
  });

  describe('Tenant membership enforcement', () => {
    it('rejects valid token when user has no membership in the tenant (403)', async () => {
      // User 1 has no membership in tenant B
      const res = await request(app)
        .get(`/api/v1/${TENANT_B.slug}/visitors`)
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      // resolveTenant already rejects because tid mismatch, but even if we
      // crafted a token with tid=tenantB.id, membership would still fail.
      expect(res.status).toBe(403);
    });

    it('rejects when tenant is suspended (403)', async () => {
      mockTenantRepo.findBySlug.mockImplementation((slug: string) => {
        if (slug === TENANT_A.slug) return Promise.resolve({ id: TENANT_A.id, slug: TENANT_A.slug, name: 'Tenant A', status: 'suspended' });
        return Promise.resolve(null);
      });

      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/visitors`)
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_UNAVAILABLE');
    });

    it('rejects when demo tenant has expired (403)', async () => {
      mockTenantRepo.findBySlug.mockImplementation((slug: string) => {
        if (slug === TENANT_A.slug) return Promise.resolve({
          id: TENANT_A.id, slug: TENANT_A.slug, name: 'Tenant A', status: 'active',
          isDemo: true, demoExpiresAt: new Date(Date.now() - 86400000), // expired yesterday
        });
        return Promise.resolve(null);
      });

      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/visitors`)
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('TENANT_UNAVAILABLE');
    });
  });

  describe('Token validation', () => {
    it('rejects expired/tampered token (401)', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/visitors`)
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res.status).toBe(401);
    });

    it('rejects missing Authorization header (401)', async () => {
      const res = await request(app).get(`/api/v1/${TENANT_A.slug}/visitors`);

      expect(res.status).toBe(401);
    });

    it('rejects non-Bearer token (401)', async () => {
      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/visitors`)
        .set('Authorization', 'Basic abc123');

      expect(res.status).toBe(401);
    });

    it('rejects blacklisted token (401)', async () => {
      mockTokenBlacklist.isBlacklisted.mockReturnValue(true);

      const res = await request(app)
        .get(`/api/v1/${TENANT_A.slug}/visitors`)
        .set('Authorization', `Bearer ${tenantAdminToken()}`);

      expect(res.status).toBe(401);
    });
  });
});
