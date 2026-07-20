/**
 * Unit tests for CreateDemoTenantUseCase.
 * Verifies demo tenant creation, 3 pre-provisioned users, seed data, and
 * that an admin access token is returned.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateDemoTenantUseCase } from '../../application/usecases/auth/CreateDemoTenant.usecase';
import { JwtAuthService } from '../../infrastructure/services/JwtAuthService';
import { Visitor } from '../../domain/entities/Visitor.entity';
import { Visit } from '../../domain/entities/Visit.entity';
import type { ITenantRepository } from '../../domain/repositories/ITenantRepository';
import type { ITenantUserRepository } from '../../domain/repositories/ITenantUserRepository';
import type { IUserRepository } from '../../domain/repositories/IUserRepository';
import type { IVisitorRepository } from '../../domain/repositories/IVisitorRepository';
import type { IVisitRepository } from '../../domain/repositories/IVisitRepository';

describe('CreateDemoTenantUseCase', () => {
  let useCase: CreateDemoTenantUseCase;
  let authService: JwtAuthService;
  let tenantRepo: ITenantRepository;
  let tenantUserRepo: ITenantUserRepository;
  let userRepo: IUserRepository;
  let visitorRepo: IVisitorRepository;
  let visitRepo: IVisitRepository;
  let createdMemberships: any[];
  let createdVisitors: any[];
  let createdVisits: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new JwtAuthService();

    createdMemberships = [];
    createdVisitors = [];
    createdVisits = [];

    tenantRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findAccessibleByUserId: vi.fn(),
      create: vi.fn().mockImplementation((t) => Promise.resolve({ ...t, id: 500 })),
    } as unknown as ITenantRepository;

    tenantUserRepo = {
      findMembership: vi.fn(),
      findMembershipBySlug: vi.fn(),
      findByUserIdWithTenant: vi.fn(),
      create: vi.fn().mockImplementation((m) => {
        createdMemberships.push(m);
        return Promise.resolve({ ...m, id: createdMemberships.length });
      }),
    } as unknown as ITenantUserRepository;

    userRepo = {
      findAll: vi.fn(),
      findByUsername: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue(null), // users don't exist yet
      findById: vi.fn(),
      findByResetToken: vi.fn(),
      save: vi.fn().mockImplementation((u) => Promise.resolve({ ...u, id: u.id ?? Math.floor(Math.random() * 1000) + 10 })),
      delete: vi.fn(),
      updatePassword: vi.fn(),
      updatePasswordChange: vi.fn(),
      updateLoginAttempts: vi.fn(),
      updateResetToken: vi.fn(),
    } as unknown as IUserRepository;

    visitorRepo = {
      findByCedula: vi.fn(),
      findById: vi.fn(),
      findByCedulaWithHistory: vi.fn(),
      findAll: vi.fn(),
      search: vi.fn(),
      findDistinctCompanies: vi.fn(),
      create: vi.fn().mockImplementation((_tid, v) => {
        createdVisitors.push(v);
        return Promise.resolve(v);
      }),
      update: vi.fn(),
      updateById: vi.fn(),
      delete: vi.fn(),
      deleteById: vi.fn(),
      exists: vi.fn(),
      count: vi.fn(),
      getPhotoBlob: vi.fn(),
      getIdPhotoBlob: vi.fn(),
    } as unknown as IVisitorRepository;

    visitRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findActive: vi.fn(),
      findIntermittent: vi.fn(),
      findByVisitor: vi.fn(),
      findByDateRange: vi.fn(),
      create: vi.fn().mockImplementation((_tid, v) => {
        createdVisits.push(v);
        return Promise.resolve(v);
      }),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      deleteOlderThan: vi.fn(),
      countByStatus: vi.fn(),
      countByDateRange: vi.fn(),
      findMissedCheckouts: vi.fn(),
      findForReport: vi.fn(),
    } as unknown as IVisitRepository;

    useCase = new CreateDemoTenantUseCase(tenantRepo, tenantUserRepo, userRepo, visitorRepo, visitRepo, authService);
  });

  it('creates a demo tenant with a unique slug and starter plan', async () => {
    const result = await useCase.execute({ name: 'Test Co', email: 'test@test.com' });

    expect(tenantRepo.create).toHaveBeenCalledOnce();
    const createdTenant = (tenantRepo.create as any).mock.calls[0][0];
    expect(createdTenant.slug).toMatch(/^demo-[a-f0-9]{8}$/);
    expect(createdTenant.isDemo).toBe(true);
    expect(createdTenant.subscriptionPlan).toBe('starter');
    expect(createdTenant.demoExpiresAt).toBeInstanceOf(Date);
  });

  it('provisions exactly 3 users (operador, admin, auditor) and memberships', async () => {
    const result = await useCase.execute({ name: 'Test Co', email: 'test@test.com' });

    expect(createdMemberships).toHaveLength(3);
    const roles = createdMemberships.map((m) => m.role).sort();
    expect(roles).toEqual(['admin', 'auditor', 'operador']);

    // Each membership should reference the same tenantId
    for (const m of createdMemberships) {
      expect(m.tenantId).toBe(500);
      expect(m.isActive).toBe(true);
    }
  });

  it('returns 3 demo credentials with the default password', async () => {
    const result = await useCase.execute({ name: 'Test Co', email: 'test@test.com' });

    expect(result.credentials).toHaveLength(3);
    for (const cred of result.credentials) {
      expect(cred.password).toBe('Demo123*');
      expect(cred.email).toMatch(/^(guardia|admin|auditor)@demo-.+\.com$/);
    }
  });

  it('seeds 5 visitors and 10 visits', async () => {
    const result = await useCase.execute({ name: 'Test Co', email: 'test@test.com' });

    expect(createdVisitors).toHaveLength(5);
    expect(createdVisits).toHaveLength(10);

    // Visitors should be Visitor instances with valid cedulas
    for (const v of createdVisitors) {
      expect(v).toBeInstanceOf(Visitor);
    }
    // Visits should be Visit instances
    for (const v of createdVisits) {
      expect(v).toBeInstanceOf(Visit);
    }
  });

  it('returns a valid admin access token scoped to the new tenant', async () => {
    const result = await useCase.execute({ name: 'Test Co', email: 'test@test.com' });

    expect(result.accessToken).toBeDefined();
    expect(typeof result.accessToken).toBe('string');

    const payload = authService.verifyAccessToken(result.accessToken);
    expect(payload).not.toBeNull();
    expect(payload?.tid).toBe(500);
    expect(payload?.tslug).toMatch(/^demo-/);
    expect(payload?.role).toBe('admin');
  });

  it('returns demo tenant metadata with slug, name, and expiry', async () => {
    const result = await useCase.execute({ name: 'Test Co', email: 'test@test.com', company: 'TestCo' });

    expect(result.demoTenant.slug).toMatch(/^demo-/);
    expect(result.demoTenant.name).toContain('Test');
    expect(result.demoTenant.expiresAt).toBeInstanceOf(Date);
  });

  it('hashes passwords for each created user', async () => {
    const result = await useCase.execute({ name: 'Test Co', email: 'test@test.com' });

    // userRepo.save should have been called 3 times with hashed passwords
    expect(userRepo.save).toHaveBeenCalledTimes(3);
    for (const call of (userRepo.save as any).mock.calls) {
      const user = call[0];
      expect(user.password).toBeDefined();
      // bcrypt hashes start with $2
      expect(user.password).toMatch(/^\$2/);
    }
  });
});
