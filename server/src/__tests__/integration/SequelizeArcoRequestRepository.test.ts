/**
 * Integration tests for SequelizeArcoRequestRepository.
 * Mocks the ArcoRequest model to verify tenantId filtering on all methods.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls: any[] = [];

vi.mock('../../models/ArcoRequest', () => ({
  default: {
    create: vi.fn((data: any) => { calls.push({ method: 'create', data }); return Promise.resolve({
      id: 1, ...data, createdAt: new Date(), updatedAt: new Date(),
      resolutionNotes: null, resolvedAt: null, update: vi.fn(),
    }); }),
    findOne: vi.fn((opts: any = {}) => { calls.push({ method: 'findOne', where: opts.where }); return Promise.resolve({
      id: 1, tenantId: opts.where?.tenantId, requestType: 'access', subjectCedulaHash: 'hash',
      subjectCedulaEncrypted: null, requestedByName: 'test', requestedByUserId: 1,
      contactEmail: null, reason: null, requestPayload: null, status: 'pending',
      resolutionNotes: null, resolvedAt: null, createdAt: new Date(), update: vi.fn(),
    }); }),
    findAndCountAll: vi.fn((opts: any = {}) => { calls.push({ method: 'findAndCountAll', where: opts.where }); return Promise.resolve({ rows: [], count: 0 }); }),
  },
}));

import { SequelizeArcoRequestRepository } from '../../audit/infrastructure/database/repositories/SequelizeArcoRequestRepository';
import { whereHasTenantId, getTenantIdFromWhere } from '../helpers/mockModels';

describe('SequelizeArcoRequestRepository — tenantId isolation', () => {
  let repo: SequelizeArcoRequestRepository;
  const TENANT_A = 1;
  const TENANT_B = 2;

  beforeEach(() => {
    calls.length = 0;
    repo = new SequelizeArcoRequestRepository();
  });

  it('create: stores tenantId in the record', async () => {
    await repo.create(TENANT_A, {
      requestType: 'access',
      subjectCedulaHash: 'hash123',
      subjectCedulaEncrypted: null,
      requestedByName: 'test',
      requestedByUserId: 1,
      contactEmail: null,
      reason: null,
      requestPayload: null,
      status: 'pending',
    });

    const createCall = calls.find((c) => c.method === 'create');
    expect(createCall.data.tenantId).toBe(TENANT_A);
  });

  it('findById: where clause includes tenantId', async () => {
    await repo.findById(TENANT_A, 1);
    const call = calls.find((c) => c.method === 'findOne');
    expect(whereHasTenantId(call.where)).toBe(true);
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
  });

  it('findAll: where clause includes tenantId', async () => {
    await repo.findAll(TENANT_A);
    const call = calls.find((c) => c.method === 'findAndCountAll');
    expect(whereHasTenantId(call.where)).toBe(true);
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
  });

  it('update: where clause includes tenantId', async () => {
    await repo.update(TENANT_A, 1, { status: 'completed' });
    const call = calls.find((c) => c.method === 'findOne');
    expect(whereHasTenantId(call.where)).toBe(true);
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
  });

  it('uses the correct tenantId for tenant B', async () => {
    await repo.findAll(TENANT_B);
    const call = calls.find((c) => c.method === 'findAndCountAll');
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_B);
  });

  it('findAll with filters still includes tenantId', async () => {
    await repo.findAll(TENANT_A, { status: 'pending', search: 'test' });
    const call = calls.find((c) => c.method === 'findAndCountAll');
    expect(whereHasTenantId(call.where)).toBe(true);
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
  });
});
