/**
 * Test helper: mock Sequelize model factories that capture the `where` clause
 * passed to findOne/findAll/destroy/count so integration tests can assert
 * that tenantId is always present.
 */
import { vi } from 'vitest';

export interface CapturedCall {
  method: string;
  where: unknown;
  [key: string]: unknown;
}

/**
 * Creates a mock Sequelize model with the static methods used by the
 * Sequelize*Repository classes. Every call is recorded in `calls` so tests
 * can inspect the `where` clause.
 */
export const createMockSequelizeModel = (calls: CapturedCall[] = []) => {
  const record = (method: string) => (opts: any = {}) => {
    calls.push({ method, where: opts.where, ...opts });
    return Promise.resolve(null);
  };

  const recordArray = (method: string) => (opts: any = {}) => {
    calls.push({ method, where: opts.where, ...opts });
    return Promise.resolve([]);
  };

  const recordCount = (method: string) => (opts: any = {}) => {
    calls.push({ method, where: opts.where, ...opts });
    return Promise.resolve(0);
  };

  const recordDestroy = (method: string) => (opts: any = {}) => {
    calls.push({ method, where: opts.where, ...opts });
    return Promise.resolve(1);
  };

  const recordCreate = (method: string) => (data: any) => {
    calls.push({ method, where: null, data });
    return Promise.resolve({ ...data, id: 1, toJSON: () => ({ ...data, id: 1 }) });
  };

  const model: any = {
    findOne: vi.fn(record('findOne')),
    findAll: vi.fn(recordArray('findAll')),
    findAndCountAll: vi.fn((opts: any = {}) => {
      calls.push({ method: 'findAndCountAll', where: opts.where, ...opts });
      return Promise.resolve({ rows: [], count: 0 });
    }),
    count: vi.fn(recordCount('count')),
    destroy: vi.fn(recordDestroy('destroy')),
    create: vi.fn(recordCreate('create')),
    sequelize: { fn: vi.fn(), col: vi.fn(), literal: vi.fn() },
    calls,
  };

  return model;
};

/**
 * Extracts the tenantId from a Sequelize where clause. Handles both flat
 * objects ({ tenantId: 1 }) and nested Op-based clauses.
 */
export const whereHasTenantId = (where: any): boolean => {
  if (!where || typeof where !== 'object') return false;
  if (where.tenantId !== undefined) return true;
  // Check nested Op.and / Op.or arrays
  for (const key of Object.getOwnPropertySymbols(where)) {
    const val = (where as any)[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && whereHasTenantId(item)) return true;
      }
    }
  }
  return false;
};

export const getTenantIdFromWhere = (where: any): unknown => {
  if (!where || typeof where !== 'object') return undefined;
  return where.tenantId;
};
