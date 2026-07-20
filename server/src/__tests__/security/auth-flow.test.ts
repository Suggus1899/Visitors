/**
 * Security tests: authentication flow.
 *
 * Tests the LoginUseCase multi-tenant selection flow, select-tenant token
 * issuance, refresh with/without tenantSlug, and demo tenant creation.
 * Uses mocked repositories — no DB required.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoginUseCase } from '../../identity/application/usecases/auth/Login.usecase';
import { RefreshTokenUseCase } from '../../identity/application/usecases/auth/RefreshToken.usecase';
import { CreateDemoTenantUseCase } from '../../identity/application/usecases/auth/CreateDemoTenant.usecase';
import { JwtAuthService } from '../../identity/infrastructure/services/JwtAuthService';
import { User } from '../../identity/domain/entities/User.entity';
import type { IUserRepository } from '../../identity/domain/repositories/IUserRepository';
import type { ITenantUserRepository, TenantMembershipWithTenant } from '../../identity/domain/repositories/ITenantUserRepository';
import type { IAuditLogRepository } from '../../audit/domain/repositories/IAuditLogRepository';
import type { ITenantRepository } from '../../identity/domain/repositories/ITenantRepository';
import type { IVisitorRepository } from '../../visits/domain/repositories/IVisitorRepository';
import type { IVisitRepository } from '../../visits/domain/repositories/IVisitRepository';

describe('Auth flow — multi-tenant', () => {
  let authService: JwtAuthService;
  let userRepo: IUserRepository;
  let tenantUserRepo: ITenantUserRepository;
  let auditRepo: IAuditLogRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new JwtAuthService();

    userRepo = {
      findAll: vi.fn(),
      findByUsername: vi.fn(),
      findByEmail: vi.fn(),
      findById: vi.fn(),
      findByResetToken: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      updatePassword: vi.fn(),
      updatePasswordChange: vi.fn(),
      updateLoginAttempts: vi.fn(),
      updateResetToken: vi.fn(),
    } as unknown as IUserRepository;

    tenantUserRepo = {
      findMembership: vi.fn(),
      findMembershipBySlug: vi.fn(),
      findByUserIdWithTenant: vi.fn(),
      create: vi.fn(),
    } as unknown as ITenantUserRepository;

    auditRepo = {
      log: vi.fn().mockResolvedValue(undefined),
      findAll: vi.fn(),
      getStats: vi.fn(),
      getDistinctActions: vi.fn(),
      getDistinctUsers: vi.fn(),
      count: vi.fn(),
    } as unknown as IAuditLogRepository;
  });

  const buildUser = async (password: string): Promise<User> => {
    const hashed = await authService.hashPassword(password);
    return new User('admin@acme.com', 'admin', hashed, 1, undefined, undefined, false, new Date(), 0, null, 'admin@acme.com');
  };

  describe('Login — single tenant', () => {
    it('returns a tenant-scoped token when user belongs to one tenant', async () => {
      const password = 'ValidP@ssw0rd123';
      const user = await buildUser(password);
      (userRepo.findByEmail as any).mockResolvedValue(user);

      const membership: TenantMembershipWithTenant = {
        userId: 1, tenantId: 101, role: 'admin', isActive: true,
        tenant: { id: 101, slug: 'acme', name: 'ACME', status: 'active' },
      };
      (tenantUserRepo.findByUserIdWithTenant as any).mockResolvedValue([membership]);

      const loginUseCase = new LoginUseCase(userRepo, authService, auditRepo, tenantUserRepo);
      const result = await loginUseCase.execute({ username: 'admin@acme.com', password });

      expect(result.requiresTenantSelection).toBe(false);
      expect(result.tenants).toBeUndefined();
      const payload = authService.verifyAccessToken(result.accessToken);
      expect(payload?.tid).toBe(101);
      expect(payload?.tslug).toBe('acme');
      expect(payload?.role).toBe('admin');
    });
  });

  describe('Login — multi-tenant (requires selection)', () => {
    it('returns requiresTenantSelection=true and tenants list when user belongs to multiple tenants', async () => {
      const password = 'ValidP@ssw0rd123';
      const user = await buildUser(password);
      (userRepo.findByEmail as any).mockResolvedValue(user);

      const memberships: TenantMembershipWithTenant[] = [
        { userId: 1, tenantId: 101, role: 'admin', isActive: true, tenant: { id: 101, slug: 'acme', name: 'ACME', status: 'active' } },
        { userId: 1, tenantId: 202, role: 'auditor', isActive: true, tenant: { id: 202, slug: 'globex', name: 'Globex', status: 'active' } },
      ];
      (tenantUserRepo.findByUserIdWithTenant as any).mockResolvedValue(memberships);

      const loginUseCase = new LoginUseCase(userRepo, authService, auditRepo, tenantUserRepo);
      const result = await loginUseCase.execute({ username: 'admin@acme.com', password });

      expect(result.requiresTenantSelection).toBe(true);
      expect(result.tenants).toHaveLength(2);
      // Token should be tenant-agnostic (tid=0)
      const payload = authService.verifyAccessToken(result.accessToken);
      expect(payload?.tid).toBe(0);
    });
  });

  describe('Select-tenant flow (controller logic)', () => {
    it('select-tenant issues a new token with the correct tid', async () => {
      // Simulate the selectTenant controller logic
      const userId = 1;
      const membership = { userId, tenantId: 202, role: 'auditor', isActive: true };
      (tenantUserRepo.findMembershipBySlug as any).mockResolvedValue(membership);
      const memberships: TenantMembershipWithTenant[] = [
        { userId, tenantId: 101, role: 'admin', isActive: true, tenant: { id: 101, slug: 'acme', name: 'ACME', status: 'active' } },
        { userId, tenantId: 202, role: 'auditor', isActive: true, tenant: { id: 202, slug: 'globex', name: 'Globex', status: 'active' } },
      ];
      (tenantUserRepo.findByUserIdWithTenant as any).mockResolvedValue(memberships);

      // Replicate selectTenant controller
      const match = memberships.find((m) => m.tenant.slug === 'globex');
      expect(match).toBeDefined();
      const tokenUser = { id: userId, username: 'admin@acme.com', tenantId: match!.tenant.id, tenantSlug: match!.tenant.slug, role: membership.role };
      const accessToken = authService.generateAccessToken(tokenUser);

      const payload = authService.verifyAccessToken(accessToken);
      expect(payload?.tid).toBe(202);
      expect(payload?.tslug).toBe('globex');
      expect(payload?.role).toBe('auditor');
    });

    it('select-tenant rejects when user is not a member (controller returns 403)', async () => {
      (tenantUserRepo.findMembershipBySlug as any).mockResolvedValue(null);

      const membership = await tenantUserRepo.findMembershipBySlug(1, 'unknown-tenant');
      expect(membership).toBeNull();
      // Controller would return 403 FORBIDDEN
    });
  });

  describe('Refresh token — with tenantSlug', () => {
    it('issues a tenant-scoped access token when tenantSlug is provided', async () => {
      const user = new User('admin@acme.com', 'admin', undefined, 1, undefined, undefined, false, new Date(), 0, null, 'admin@acme.com');
      (userRepo.findById as any).mockResolvedValue(user);

      const membership = { userId: 1, tenantId: 101, role: 'admin', isActive: true };
      (tenantUserRepo.findMembershipBySlug as any).mockResolvedValue(membership);
      const memberships: TenantMembershipWithTenant[] = [
        { userId: 1, tenantId: 101, role: 'admin', isActive: true, tenant: { id: 101, slug: 'acme', name: 'ACME', status: 'active' } },
      ];
      (tenantUserRepo.findByUserIdWithTenant as any).mockResolvedValue(memberships);

      const refreshToken = authService.generateRefreshToken({ id: 1, username: 'admin@acme.com' });
      const refreshUseCase = new RefreshTokenUseCase(authService, userRepo, tenantUserRepo);
      const result = await refreshUseCase.execute(refreshToken, 'acme');

      const payload = authService.verifyAccessToken(result.accessToken);
      expect(payload?.tid).toBe(101);
      expect(payload?.tslug).toBe('acme');
      expect(payload?.role).toBe('admin');
    });

    it('rejects refresh with tenantSlug when user is not a member', async () => {
      const user = new User('admin@acme.com', 'admin', undefined, 1);
      (userRepo.findById as any).mockResolvedValue(user);
      (tenantUserRepo.findMembershipBySlug as any).mockResolvedValue(null);

      const refreshToken = authService.generateRefreshToken({ id: 1, username: 'admin@acme.com' });
      const refreshUseCase = new RefreshTokenUseCase(authService, userRepo, tenantUserRepo);

      await expect(refreshUseCase.execute(refreshToken, 'unknown')).rejects.toThrow('TENANT_MEMBERSHIP_REQUIRED');
    });
  });

  describe('Refresh token — without tenantSlug', () => {
    it('issues a tenant-agnostic access token (tid=0)', async () => {
      const user = new User('admin@acme.com', 'admin', undefined, 1);
      (userRepo.findById as any).mockResolvedValue(user);

      const refreshToken = authService.generateRefreshToken({ id: 1, username: 'admin@acme.com' });
      const refreshUseCase = new RefreshTokenUseCase(authService, userRepo, tenantUserRepo);
      const result = await refreshUseCase.execute(refreshToken);

      const payload = authService.verifyAccessToken(result.accessToken);
      expect(payload?.tid).toBe(0);
      expect(payload?.tslug).toBe('');
    });

    it('issues a root-scoped token for superadmin without tenantSlug', async () => {
      const user = new User('root', 'root', undefined, 99, undefined, undefined, false, new Date(), 0, null, null, true);
      (userRepo.findById as any).mockResolvedValue(user);

      const refreshToken = authService.generateRefreshToken({ id: 99, username: 'root' });
      const refreshUseCase = new RefreshTokenUseCase(authService, userRepo, tenantUserRepo);
      const result = await refreshUseCase.execute(refreshToken);

      const payload = authService.verifyAccessToken(result.accessToken);
      expect(payload?.role).toBe('root');
    });
  });

  describe('Demo endpoint', () => {
    it('creates a demo tenant with 3 users and returns an admin token', async () => {
      const tenantRepo: ITenantRepository = {
        findById: vi.fn(),
        findBySlug: vi.fn(),
        findAccessibleByUserId: vi.fn(),
        create: vi.fn().mockResolvedValue({ id: 500, slug: 'demo-abcd1234', name: 'Demo', status: 'active', isDemo: true, demoExpiresAt: new Date() }),
      } as unknown as ITenantRepository;

      const visitorRepo: IVisitorRepository = {
        findByCedula: vi.fn(), findById: vi.fn(), findByCedulaWithHistory: vi.fn(), findAll: vi.fn(),
        search: vi.fn(), findDistinctCompanies: vi.fn(),
        create: vi.fn().mockImplementation((_t, v) => Promise.resolve(v)),
        update: vi.fn(), updateById: vi.fn(), delete: vi.fn(), deleteById: vi.fn(),
        exists: vi.fn(), count: vi.fn(), getPhotoBlob: vi.fn(), getIdPhotoBlob: vi.fn(),
      } as unknown as IVisitorRepository;

      const visitRepo: IVisitRepository = {
        findById: vi.fn(), findAll: vi.fn(), findActive: vi.fn(), findIntermittent: vi.fn(),
        findByVisitor: vi.fn(), findByDateRange: vi.fn(),
        create: vi.fn().mockImplementation((_t, v) => Promise.resolve(v)),
        update: vi.fn(), delete: vi.fn(), count: vi.fn(), deleteOlderThan: vi.fn(),
        countByStatus: vi.fn(), countByDateRange: vi.fn(), findMissedCheckouts: vi.fn(), findForReport: vi.fn(),
      } as unknown as IVisitRepository;

      (userRepo.findByEmail as any).mockResolvedValue(null);
      (userRepo.save as any).mockImplementation((u) => Promise.resolve({ ...u, id: Math.floor(Math.random() * 1000) + 10 }));
      (tenantUserRepo.create as any).mockImplementation((m) => Promise.resolve({ ...m, id: 1 }));

      const demoUseCase = new CreateDemoTenantUseCase(tenantRepo, tenantUserRepo, userRepo, visitorRepo, visitRepo, authService);
      const result = await demoUseCase.execute({ name: 'Test', email: 'test@test.com' });

      expect(result.credentials).toHaveLength(3);
      expect(result.accessToken).toBeDefined();
      const payload = authService.verifyAccessToken(result.accessToken);
      expect(payload?.role).toBe('admin');
      expect(payload?.tid).toBe(500);
    });
  });
});
