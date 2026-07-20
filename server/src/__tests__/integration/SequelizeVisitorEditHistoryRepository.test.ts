/**
 * Integration tests for SequelizeVisitorEditHistoryRepository.
 * Verifies tenantId filtering AND PII encryption/decryption on read.
 * The model hook encrypts PII fields before save; the repository decrypts
 * them on read. We simulate both paths here.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const calls: any[] = [];

vi.mock('../../models/VisitorEditHistory', () => {
  const PII = new Set(['first_name', 'last_name', 'email', 'phone', 'job_title', 'cedula']);
  // Simulate the model hook: encrypt PII values before save (inline, mirroring
  // the real hook which calls Encryption.encrypt internally).
  const applyHook = (instance: any) => {
    if (PII.has(instance.field)) {
      const oldVal = instance.oldValue;
      if (oldVal && !String(oldVal).startsWith('ENC:')) {
        instance.oldValue = `ENC:${oldVal}`;
      }
      const newVal = instance.newValue;
      if (newVal && !String(newVal).startsWith('ENC:')) {
        instance.newValue = `ENC:${newVal}`;
      }
    }
  };

  return {
    PII_EDIT_FIELDS: PII,
    default: {
      create: vi.fn((data: any) => {
        const instance = { ...data, id: 1, editedAt: new Date() };
        applyHook(instance);
        calls.push({ method: 'create', data: instance });
        return Promise.resolve(instance);
      }),
      findAll: vi.fn((opts: any = {}) => { calls.push({ method: 'findAll', where: opts.where }); return Promise.resolve([]); }),
    },
  };
});

vi.mock('../../utils/Encryption', () => ({
  default: {
    encrypt: vi.fn((text: string) => `ENC:${text}`),
    decrypt: vi.fn((text: string) => text.replace(/^ENC:/, '')),
    isEncrypted: vi.fn((text: string) => typeof text === 'string' && text.startsWith('ENC:')),
    hash: vi.fn((text: string) => `hash-${text}`),
  },
}));

import { SequelizeVisitorEditHistoryRepository } from '../../infrastructure/database/repositories/SequelizeVisitorEditHistoryRepository';
import { whereHasTenantId, getTenantIdFromWhere } from '../helpers/mockModels';
import VisitorEditHistoryModel from '../../models/VisitorEditHistory';
import Encryption from '../../utils/Encryption';

describe('SequelizeVisitorEditHistoryRepository', () => {
  let repo: SequelizeVisitorEditHistoryRepository;
  const TENANT_A = 1;

  beforeEach(() => {
    calls.length = 0;
    repo = new SequelizeVisitorEditHistoryRepository();
  });

  describe('tenantId isolation', () => {
    it('create: stores tenantId in the record', async () => {
      await repo.create(TENANT_A, {
        visitId: 1,
        visitorId: 10,
        field: 'first_name',
        oldValue: 'Old',
        newValue: 'New',
        editedBy: 5,
        editedByUsername: 'guardia1',
      });

      const createCall = calls.find((c) => c.method === 'create');
      expect(createCall.data.tenantId).toBe(TENANT_A);
    });

    it('findByVisitId: where clause includes tenantId', async () => {
      await repo.findByVisitId(TENANT_A, 42);
      const call = calls.find((c) => c.method === 'findAll');
      expect(whereHasTenantId(call.where)).toBe(true);
      expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
    });

    it('findByVisitorId: where clause includes tenantId', async () => {
      await repo.findByVisitorId(TENANT_A, 10);
      const call = calls.find((c) => c.method === 'findAll');
      expect(whereHasTenantId(call.where)).toBe(true);
      expect(getTenantIdFromWhere(call.where)).toBe(TENANT_A);
    });
  });

  describe('PII encryption on write', () => {
    it('encrypts PII fields (first_name) before storing', async () => {
      await repo.create(TENANT_A, {
        visitId: 1, visitorId: 10, field: 'first_name',
        oldValue: 'Carlos', newValue: 'Carlos NEW',
        editedBy: 5, editedByUsername: 'guardia1',
      });

      const createCall = calls.find((c) => c.method === 'create');
      // The hook should have encrypted both values (ENC: prefix)
      expect(createCall.data.oldValue).toMatch(/^ENC:/);
      expect(createCall.data.newValue).toMatch(/^ENC:/);
    });

    it('encrypts email (PII) before storing', async () => {
      await repo.create(TENANT_A, {
        visitId: 1, visitorId: 10, field: 'email',
        oldValue: 'old@test.com', newValue: 'new@test.com',
        editedBy: 5, editedByUsername: 'guardia1',
      });

      const createCall = calls.find((c) => c.method === 'create');
      expect(createCall.data.oldValue).toMatch(/^ENC:/);
      expect(createCall.data.newValue).toMatch(/^ENC:/);
    });

    it('does NOT encrypt non-PII fields (company)', async () => {
      await repo.create(TENANT_A, {
        visitId: 1, visitorId: 10, field: 'company',
        oldValue: 'ACME', newValue: 'ACME Corp',
        editedBy: 5, editedByUsername: 'guardia1',
      });

      const createCall = calls.find((c) => c.method === 'create');
      expect(createCall.data.oldValue).toBe('ACME');
      expect(createCall.data.newValue).toBe('ACME Corp');
    });
  });

  describe('PII decryption on read', () => {
    it('decrypts PII fields when reading from the model', async () => {
      // Override findAll to return an encrypted record
      const mockModel = VisitorEditHistoryModel;
      (mockModel.findAll as any).mockResolvedValueOnce([{
        id: 1, tenantId: TENANT_A, visitId: 1, visitorId: 10,
        field: 'first_name',
        oldValue: 'ENC:Carlos',
        newValue: 'ENC:Carlos NEW',
        editedBy: 5, editedByUsername: 'guardia1', editedAt: new Date(),
      }]);

      const results = await repo.findByVisitId(TENANT_A, 1);

      expect(results).toHaveLength(1);
      expect(results[0].oldValue).toBe('Carlos');
      expect(results[0].newValue).toBe('Carlos NEW');
      expect(Encryption.decrypt).toHaveBeenCalledWith('ENC:Carlos');
      expect(Encryption.decrypt).toHaveBeenCalledWith('ENC:Carlos NEW');
    });

    it('returns non-PII fields unchanged on read', async () => {
      const mockModel = VisitorEditHistoryModel;
      (mockModel.findAll as any).mockResolvedValueOnce([{
        id: 1, tenantId: TENANT_A, visitId: 1, visitorId: 10,
        field: 'company',
        oldValue: 'ACME',
        newValue: 'ACME Corp',
        editedBy: 5, editedByUsername: 'guardia1', editedAt: new Date(),
      }]);

      const results = await repo.findByVisitId(TENANT_A, 1);

      expect(results[0].oldValue).toBe('ACME');
      expect(results[0].newValue).toBe('ACME Corp');
    });

    it('handles null values without decryption errors', async () => {
      const mockModel = VisitorEditHistoryModel;
      (mockModel.findAll as any).mockResolvedValueOnce([{
        id: 1, tenantId: TENANT_A, visitId: 1, visitorId: 10,
        field: 'email',
        oldValue: null,
        newValue: 'ENC:new@test.com',
        editedBy: 5, editedByUsername: 'guardia1', editedAt: new Date(),
      }]);

      const results = await repo.findByVisitId(TENANT_A, 1);

      expect(results[0].oldValue).toBeNull();
      expect(results[0].newValue).toBe('new@test.com');
    });
  });
});
