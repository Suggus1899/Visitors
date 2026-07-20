/**
 * Integration tests for SequelizeVisitorRepository.
 * Mocks the Sequelize Visitor model to verify that every method includes
 * tenantId in the where clause — the core multi-tenant isolation guarantee.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Visitor } from '../../visits/domain/entities/Visitor.entity';

// Capture calls before importing the repository so vi.mock is hoisted correctly
const calls: any[] = [];

// Mock model instance returned by findOne (for update/updateById)
const mockModelInstance = {
  id: 1,
  photo_data: null,
  id_photo_data: null,
  getDecrypted: () => ({
    id: 1, cedula: 'V-12345678', first_name: 'Carlos', last_name: 'Gomez',
    company: 'ACME', job_title: null, photo_url: null, id_photo_url: null,
    email: null, phone: null, isBlocked: false, observations: null, createdAt: new Date(),
  }),
  update: vi.fn(),
};

vi.mock('../../models/Visitor', () => ({
  default: {
    findOne: vi.fn((opts: any = {}) => { calls.push({ method: 'findOne', where: opts.where }); return Promise.resolve(mockModelInstance); }),
    findAll: vi.fn((opts: any = {}) => { calls.push({ method: 'findAll', where: opts.where }); return Promise.resolve([]); }),
    count: vi.fn((opts: any = {}) => { calls.push({ method: 'count', where: opts.where }); return Promise.resolve(0); }),
    destroy: vi.fn((opts: any = {}) => { calls.push({ method: 'destroy', where: opts.where }); return Promise.resolve(1); }),
    create: vi.fn((data: any) => { calls.push({ method: 'create', data }); return Promise.resolve({ ...mockModelInstance, ...data }); }),
    sequelize: { fn: vi.fn(), col: vi.fn() },
  },
}));

vi.mock('../../models/Visit', () => ({
  default: {
    findAll: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('../../utils/Encryption', () => ({
  default: {
    hash: vi.fn((text: string) => `hash-${text}`),
    encrypt: vi.fn((text: string) => `ENC:${text}`),
    decrypt: vi.fn((text: string) => text.replace(/^ENC:/, '')),
    isEncrypted: vi.fn(() => false),
  },
}));

import { SequelizeVisitorRepository } from '../../visits/infrastructure/database/repositories/SequelizeVisitorRepository';
import { whereHasTenantId, getTenantIdFromWhere } from '../helpers/mockModels';

describe('SequelizeVisitorRepository — tenantId isolation', () => {
  let repo: SequelizeVisitorRepository;
  const TENANT_A = 1;
  const TENANT_B = 2;

  beforeEach(() => {
    calls.length = 0;
    mockModelInstance.update.mockClear();
    repo = new SequelizeVisitorRepository();
  });

  const methodsWithTenantId = [
    { name: 'findByCedula', call: () => repo.findByCedula(TENANT_A, 'V-12345678') },
    { name: 'findById', call: () => repo.findById(TENANT_A, 1) },
    { name: 'findAll', call: () => repo.findAll(TENANT_A) },
    { name: 'search', call: () => repo.search(TENANT_A, 'ACME') },
    { name: 'findDistinctCompanies', call: () => repo.findDistinctCompanies(TENANT_A) },
    { name: 'create', call: () => repo.create(TENANT_A, new Visitor(undefined, 'V-12345678', 'Carlos', 'Gomez', 'ACME')) },
    { name: 'update', call: () => repo.update(TENANT_A, 'V-12345678', { firstName: 'Carlos2' }) },
    { name: 'updateById', call: () => repo.updateById(TENANT_A, 1, { firstName: 'Carlos2' }) },
    { name: 'delete', call: () => repo.delete(TENANT_A, 'V-12345678') },
    { name: 'deleteById', call: () => repo.deleteById(TENANT_A, 1) },
    { name: 'exists', call: () => repo.exists(TENANT_A, 'V-12345678') },
    { name: 'count', call: () => repo.count(TENANT_A) },
    { name: 'getPhotoBlob', call: () => repo.getPhotoBlob(TENANT_A, 'V-12345678') },
    { name: 'getIdPhotoBlob', call: () => repo.getIdPhotoBlob(TENANT_A, 'V-12345678') },
  ];

  for (const { name, call } of methodsWithTenantId) {
    it(`${name}: where clause includes tenantId`, async () => {
      await call();
      // For create, tenantId is in the data object
      if (name === 'create') {
        const createCall = calls.find((c) => c.method === 'create');
        expect(createCall.data.tenantId).toBe(TENANT_A);
      } else {
        const queryCall = calls.find((c) => c.where !== undefined);
        expect(queryCall).toBeDefined();
        expect(whereHasTenantId(queryCall.where)).toBe(true);
        expect(getTenantIdFromWhere(queryCall.where)).toBe(TENANT_A);
      }
    });
  }

  it('uses the correct tenantId for tenant B (no cross-tenant leakage)', async () => {
    await repo.findAll(TENANT_B);
    const call = calls.find((c) => c.method === 'findAll');
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_B);
    expect(getTenantIdFromWhere(call.where)).not.toBe(TENANT_A);
  });

  it('findAll with company filter still includes tenantId', async () => {
    await repo.findAll(TENANT_A, { company: 'ACME' });
    const call = calls.find((c) => c.method === 'findAll');
    expect(whereHasTenantId(call.where)).toBe(true);
  });

  it('count with filters still includes tenantId', async () => {
    await repo.count(TENANT_A, { company: 'ACME' });
    const call = calls.find((c) => c.method === 'count');
    expect(whereHasTenantId(call.where)).toBe(true);
  });
});
