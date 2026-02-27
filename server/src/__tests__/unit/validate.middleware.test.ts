import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate';

// ── Helpers ──────────────────────────────────────────────────
const makeReqRes = (body: unknown) => {
  const req = { body } as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next: NextFunction = vi.fn();
  return { req, res, next };
};

/** Extract the nested details array from the middleware response */
const getDetails = (res: Response) =>
  (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0]?.error?.details ?? [];

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number({ message: 'Age must be a number' }).int().min(0),
});

// ── Tests ─────────────────────────────────────────────────────
describe('validate middleware', () => {
  it('calls next() and attaches parsed data when body is valid', () => {
    const { req, res, next } = makeReqRes({ name: 'Alice', age: 30 });
    validate(schema)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(); // no error arg
    expect(req.body).toEqual({ name: 'Alice', age: 30 });
  });

  it('returns 400 when body is invalid', () => {
    const { req, res, next } = makeReqRes({ name: '', age: 'not-a-number' });
    validate(schema)(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR code on failure', () => {
    const { req, res, next } = makeReqRes({ name: '', age: 'bad' });
    validate(schema)(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('populates error.details with field-level errors', () => {
    const { req, res, next } = makeReqRes({ name: '', age: 'bad' });
    validate(schema)(req, res, next);
    const details = getDetails(res);
    expect(details).toBeInstanceOf(Array);
    expect(details.length).toBeGreaterThan(0);
    expect(details[0]).toMatchObject({ field: expect.any(String), message: expect.any(String) });
  });

  it('includes the failing field name in error.details', () => {
    const { req, res, next } = makeReqRes({ age: 25 }); // name missing
    validate(schema)(req, res, next);
    const details = getDetails(res);
    expect(details.some((e: { field: string }) => e.field === 'name')).toBe(true);
  });

  it('does not call next() on failure', () => {
    const { req, res, next } = makeReqRes({ name: '', age: -1 });
    validate(schema)(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});
