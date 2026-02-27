import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';

const makeReqRes = () => {
  const req = {} as Request;
  const res = {} as Response;
  const next: NextFunction = vi.fn();
  return { req, res, next };
};

describe('asyncHandler', () => {
  it('calls the handler and does NOT call next(err) when no error is thrown', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const { req, res, next } = makeReqRes();
    await asyncHandler(handler)(req, res, next);
    expect(handler).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards errors to next(err) when the handler rejects', async () => {
    const boom = new Error('something went wrong');
    const handler = vi.fn().mockRejectedValue(boom);
    const { req, res, next } = makeReqRes();
    await asyncHandler(handler)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith(boom);
  });

  it('forwards synchronous errors (thrown inside async) to next()', async () => {
    const boom = new Error('sync inside async');
    const handler = vi.fn(async () => { throw boom; });
    const { req, res, next } = makeReqRes();
    await asyncHandler(handler)(req, res, next);
    expect(next).toHaveBeenCalledWith(boom);
  });
});
