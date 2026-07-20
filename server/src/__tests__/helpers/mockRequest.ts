/**
 * Test helper: create Express mock request/response objects with the
 * tenant context (req.tenantId, req.user) that controllers expect.
 */
import { Response } from 'express';

export interface MockRequestOptions {
  user?: { id: number; username: string; role?: string; tid?: number; tslug?: string; email?: string | null };
  tenantId?: number;
  tenantRole?: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

export const mockRequest = (opts: MockRequestOptions = {}) => {
  const req: any = {
    user: opts.user,
    tenantId: opts.tenantId,
    tenantRole: opts.tenantRole as any,
    params: opts.params ?? {},
    query: opts.query ?? {},
    body: opts.body ?? {},
    headers: opts.headers ?? {},
    get(name: string) {
      return this.headers[name.toLowerCase()];
    },
    ip: '127.0.0.1',
  };
  return req as any;
};

export const mockResponse = () => {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    flushHeaders: vi.fn(),
  };
  return res as unknown as Response;
};

export const mockNext = () => vi.fn();

// Re-export vitest globals so callers don't need a separate import
import { vi } from 'vitest';
