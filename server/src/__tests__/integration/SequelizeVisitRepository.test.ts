/**
 * Integration tests for SequelizeVisitRepository.
 * Mocks the Sequelize Visit/Visitor models to verify that every method
 * includes tenantId in the where clause.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls: any[] = [];

vi.mock('../../models/Visit', () => ({
  default: {
    findOne: vi.fn((opts: any = {}) => { calls.push({ method: 'findOne', where: opts.where }); return Promise.resolve({
      id: 1, visitor_cedula: 'hash-V-12345678', check_in_time: new Date(), purpose: 'test',
      person_to_visit: 'test', status: 'active', notes: null, check_out_time: null,
      companion_name: null, companion_cedula: null, vehicle_brand: null, vehicle_model: null,
      vehicle_plate: null, area: null, action: 'Ninguna', department: null,
      arrival_time: null, entry_time: null, exit_time: null,
      target_department: null, host_person: null, Visitor: null,
      update: vi.fn(), reload: vi.fn(),
    }); }),
    findAll: vi.fn((opts: any = {}) => { calls.push({ method: 'findAll', where: opts.where }); return Promise.resolve([]); }),
    count: vi.fn((opts: any = {}) => { calls.push({ method: 'count', where: opts.where }); return Promise.resolve(0); }),
    destroy: vi.fn((opts: any = {}) => { calls.push({ method: 'destroy', where: opts.where }); return Promise.resolve(1); }),
    create: vi.fn((data: any) => { calls.push({ method: 'create', data }); return Promise.resolve({
      id: 1, ...data, reload: vi.fn(), Visitor: null,
      check_in_time: new Date(), purpose: 'test', person_to_visit: 'test', status: 'active',
      visitor_cedula: 'hash-V-12345678', notes: null, companion_name: null, companion_cedula: null,
      vehicle_brand: null, vehicle_model: null, vehicle_plate: null, area: null, action: 'Ninguna',
      department: null, arrival_time: null, entry_time: null, exit_time: null,
      target_department: null, host_person: null, check_out_time: null,
    }); }),
  },
}));

vi.mock('../../models/Visitor', () => ({
  default: {
    findOne: vi.fn((opts: any = {}) => { calls.push({ method: 'visitor.findOne', where: opts.where }); return Promise.resolve({ id: 10 }); }),
    findAll: vi.fn(() => Promise.resolve([])),
  },
}));

vi.mock('../../models/IntermittentLog', () => ({
  default: {},
}));

vi.mock('../../utils/Encryption', () => ({
  default: {
    hash: vi.fn((text: string) => `hash-${text}`),
    encrypt: vi.fn((text: string) => `ENC:${text}`),
    decrypt: vi.fn((text: string) => text.replace(/^ENC:/, '')),
    isEncrypted: vi.fn(() => false),
  },
}));

import { SequelizeVisitRepository } from '../../visits/infrastructure/database/repositories/SequelizeVisitRepository';
import { whereHasTenantId, getTenantIdFromWhere } from '../helpers/mockModels';
import { Visit, VisitStatus } from '../../visits/domain/entities/Visit.entity';

describe('SequelizeVisitRepository — tenantId isolation', () => {
  let repo: SequelizeVisitRepository;
  const TENANT_A = 1;
  const TENANT_B = 2;

  beforeEach(() => {
    calls.length = 0;
    repo = new SequelizeVisitRepository();
  });

  const methodsWithTenantId = [
    { name: 'findById', call: () => repo.findById(TENANT_A, 1) },
    { name: 'findAll', call: () => repo.findAll(TENANT_A) },
    { name: 'findActive', call: () => repo.findActive(TENANT_A) },
    { name: 'findIntermittent', call: () => repo.findIntermittent(TENANT_A) },
    { name: 'findByDateRange', call: () => repo.findByDateRange(TENANT_A, new Date(), new Date()) },
    { name: 'update', call: () => repo.update(TENANT_A, 1, { status: VisitStatus.COMPLETED }) },
    { name: 'delete', call: () => repo.delete(TENANT_A, 1) },
    { name: 'count', call: () => repo.count(TENANT_A) },
    { name: 'deleteOlderThan', call: () => repo.deleteOlderThan(TENANT_A, new Date()) },
    { name: 'countByStatus', call: () => repo.countByStatus(TENANT_A, VisitStatus.ACTIVE) },
    { name: 'countByDateRange', call: () => repo.countByDateRange(TENANT_A, new Date(), new Date()) },
    { name: 'findMissedCheckouts', call: () => repo.findMissedCheckouts(TENANT_A, new Date()) },
    { name: 'findForReport', call: () => repo.findForReport(TENANT_A, new Date(), new Date()) },
  ];

  for (const { name, call } of methodsWithTenantId) {
    it(`${name}: where clause includes tenantId`, async () => {
      await call();
      const queryCall = calls.find((c) => c.where !== undefined && c.method !== 'visitor.findOne');
      expect(queryCall).toBeDefined();
      expect(whereHasTenantId(queryCall.where)).toBe(true);
      expect(getTenantIdFromWhere(queryCall.where)).toBe(TENANT_A);
    });
  }

  it('create: stores tenantId in the record', async () => {
    const visit = new Visit('V-12345678', new Date(), 'Reunion', 'Juan', VisitStatus.ACTIVE);
    await repo.create(TENANT_A, visit);

    const createCall = calls.find((c) => c.method === 'create');
    expect(createCall.data.tenantId).toBe(TENANT_A);
  });

  it('findByVisitor: filters visits by tenantId', async () => {
    await repo.findByVisitor(TENANT_A, 'V-12345678');

    // findByVisitor does two queries: visitor lookup, then visit findAll
    const visitCall = calls.find((c) => c.method === 'findAll');
    expect(visitCall).toBeDefined();
    expect(whereHasTenantId(visitCall.where)).toBe(true);
    expect(getTenantIdFromWhere(visitCall.where)).toBe(TENANT_A);
  });

  it('uses the correct tenantId for tenant B', async () => {
    await repo.findAll(TENANT_B);
    const call = calls.find((c) => c.method === 'findAll');
    expect(getTenantIdFromWhere(call.where)).toBe(TENANT_B);
  });

  it('findAll with filters still includes tenantId', async () => {
    await repo.findAll(TENANT_A, { status: VisitStatus.ACTIVE, search: 'test' });
    const call = calls.find((c) => c.method === 'findAll');
    expect(whereHasTenantId(call.where)).toBe(true);
  });
});
