import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate, validateQuery } from '../../middleware/validate';

const mockReq = (body: unknown = {}, query: Record<string, string> = {}): Request =>
  ({ body, query, path: '/test', method: 'POST' } as unknown as Request);

const mockRes = (): Response => {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(),
  } as unknown as Response;
  return res;
};

const mockNext = (): NextFunction => vi.fn() as unknown as NextFunction;

describe('validate middleware', () => {
  it('passes when body matches schema', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const req = mockReq({ name: 'Alice', age: 30 });
    const res = mockRes();
    const next = mockNext();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 with field errors when body is invalid', () => {
    const schema = z.object({ name: z.string().min(1), age: z.number().min(0) });
    const req = mockReq({ name: '', age: -1 });
    const res = mockRes();
    const next = mockNext();

    validate(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonArg.success).toBe(false);
    expect(jsonArg.error.code).toBe('VALIDATION_ERROR');
    expect(jsonArg.error.details).toHaveLength(2);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing required fields', () => {
    const schema = z.object({ name: z.string() });
    const req = mockReq({});
    const res = mockRes();
    const next = mockNext();

    validate(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('overwrites req.body with parsed data on success', () => {
    const schema = z.object({ count: z.number() });
    const req = mockReq({ count: '5', extra: true });
    const res = mockRes();
    const next = mockNext();

    validate(z.object({ count: z.coerce.number() }))(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.body.count).toBe(5);
  });
});

describe('validateQuery middleware', () => {
  it('passes when query matches schema', () => {
    const schema = z.object({ page: z.coerce.number().optional() });
    const req = mockReq({}, { page: '3' });
    const res = mockRes();
    const next = mockNext();

    validateQuery(schema)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 400 when query is invalid', () => {
    const schema = z.object({ limit: z.coerce.number().min(1).max(100) });
    const req = mockReq({}, { limit: '999' });
    const res = mockRes();
    const next = mockNext();

    validateQuery(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonArg = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonArg.error.code).toBe('VALIDATION_ERROR');
    expect(next).not.toHaveBeenCalled();
  });
});
