/**
 * Integration tests for SequelizeAuditLogRepository.
 * Mocks the ActivityLog model to verify tenantId filtering on all read
 * methods. Note: tenantId=0 is the superadmin "global" sentinel and
 * intentionally skips the tenant filter.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls: any[] = [];

vi.mock('../../models/ActivityLog', () => ({
  default: {
    create: vi.fn((data: any) => { calls.push({ method: 'create', data }); return Promise.resolve(data); }),
    findAndCountAll: vi.fn((opts: any = {}) => { calls.push({ method: 'findAndCountAll', where: opts.where }); return Promise.resolve({ rows: [], count: 0 }); }),
    count: vi.fn((opts: any = {}) => { calls.push({ method: 'count', where: opts.where }); return Promise.resolve(0); }),
    findAll: vi.fn((opts: any = {}) => { calls.push({ method: 'findAll', where: opts.where, attributes: opts.attributes }); return Promise.resolve([]); }),
  },
}));

vi.mock('../../config/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { SequelizeAuditLogRepository } from '../../infrastructure/database/repositories/SequelizeAuditLogRepository';
import { whereHasTenantId, getTenantIdFromWhere } from '../helpers/mockModels';

describe('SequelizeAuditLogRepository — tenantId isolation', () => {
  let repo: SequelizeAuditLogRepository;
  const TENANT_A = 1;
  const TENANT_B = 2;

  beforeEach(() => {
    calls.length = 0;
    repo = new SequelizeAuditLogRepository();
  });

  it('findAll: where clause includes tenantId', async () => {
    await repo.findAll(TENANT_A);
    const call = calls.find((c) => c.method === 'findAndCountAll');
    expect(whereHasTenantId(call.where)).toBe(true);
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
  });

  it('count: where clause includes tenantId', async () => {
    await repo.count(TENANT_A);
    const call = calls.find((c) => c.method === 'count');
    expect(whereHasTenantId(call.where)).toBe(true);
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
  });

  it('getDistinctActions: where clause includes tenantId', async () => {
    await repo.getDistinctActions(TENANT_A);
    const call = calls.find((c) => c.method === 'findAll');
    expect(whereHasTenantId(call.where)).toBe(true);
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
  });

  it('getDistinctUsers: where clause includes tenantId', async () => {
    await repo.getDistinctUsers(TENANT_A);
    const call = calls.find((c) => c.method === 'findAll');
    expect(whereHasTenantId(call.where)).toBe(true);
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
  });

  it('getStats: all queries include tenantId', async () => {
    await repo.getStats(TENANT_A);
    const countCalls = calls.filter((c) => c.method === 'count');
    expect(countCalls.length).toBeGreaterThan(0);
    for (const call of countCalls) {
      expect(whereHasTenantId(call.where)).toBe(true);
    }
  });

  it('log: stores tenantId in the record', async () => {
    await repo.log({
      tenantId: TENANT_A,
      userId: 1,
      username: 'admin',
      action: 'LOGIN',
      entity: 'User',
      entityId: '1',
    });

    const createCall = calls.find((c) => c.method === 'create');
    expect(createCall.data.tenantId).toBe(TENANT_A);
  });

  it('uses the correct tenantId for tenant B', async () => {
    await repo.findAll(TENANT_B);
    const call = calls.find((c) => c.method === 'findAndCountAll');
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_B);
  });

  it('tenantId=0 (superadmin global) skips the tenant filter', async () => {
    await repo.findAll(0);
    const call = calls.find((c) => c.method === 'findAndCountAll');
    // tenantId=0 is the explicit "no tenant filter" sentinel for superadmin
    expect(whereHasTenantId(call.where)).toBe(false);
  });

  it('findAll with filters still includes tenantId', async () => {
    await repo.findAll(TENANT_A, { action: 'LOGIN', userId: 1 });
    const call = calls.find((c) => c.method === 'findAndCountAll');
    expect(whereHasTenantId(call.where)).toBe(true);
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
  });
});
