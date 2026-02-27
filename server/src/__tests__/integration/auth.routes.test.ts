/**
 * Integration tests for auth routes.
 * Isolated Express app — no DB. Validates middleware rejects bad payloads.
 * Response shape from validate middleware: { success, error: { code, message, details } }
 */
import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../../schemas/auth.schema';
import { errorHandler } from '../../middleware/error';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());

  const ok = (msg = 'ok') => asyncHandler(async (_req, res) => {
    res.json({ success: true, data: { message: msg } });
  });

  app.post('/api/v1/auth/login', validate(loginSchema), ok('logged-in'));
  app.post('/api/v1/auth/forgot-password', validate(forgotPasswordSchema), ok('email-sent'));
  app.post('/api/v1/auth/reset-password', validate(resetPasswordSchema), ok('reset'));

  app.use(errorHandler);
  return app;
};

/** Get the details array from the error response */
const details = (res: request.Response) => res.body?.error?.details ?? [];

let app: ReturnType<typeof buildTestApp>;
beforeAll(() => { app = buildTestApp(); });

// ──────────────────────────────────────────────────
// POST /api/v1/auth/login
// ──────────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  it('returns 200 on valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'secret' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 + VALIDATION_ERROR when username is missing', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ password: 'secret' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(details(res).some((e: { field: string }) => e.field === 'username')).toBe(true);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
    expect(details(res).some((e: { field: string }) => e.field === 'password')).toBe(true);
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
    const fields = details(res).map((e: { field: string }) => e.field);
    expect(fields).toContain('username');
    expect(fields).toContain('password');
  });

  it('returns 400 when username exceeds max length', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'a'.repeat(101), password: 'pass' });
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────
// POST /api/v1/auth/forgot-password
// ──────────────────────────────────────────────────
describe('POST /api/v1/auth/forgot-password', () => {
  it('returns 200 on valid body', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ username: 'admin' });
    expect(res.status).toBe(200);
  });

  it('returns 400 when username is empty', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ username: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });
});

// ──────────────────────────────────────────────────
// POST /api/v1/auth/reset-password
// ──────────────────────────────────────────────────
describe('POST /api/v1/auth/reset-password', () => {
  it('returns 200 with valid token and password', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password').send({ token: 'tok123', newPassword: 'newpass' });
    expect(res.status).toBe(200);
  });

  it('returns 400 when newPassword is too short', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password').send({ token: 'tok123', newPassword: '123' });
    expect(res.status).toBe(400);
    const passErr = details(res).find((e: { field: string }) => e.field === 'newPassword');
    expect(passErr).toBeDefined();
    expect(passErr.message).toMatch(/6/);
  });

  it('returns 400 when token is empty', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password').send({ token: '', newPassword: 'supersecret' });
    expect(res.status).toBe(400);
    expect(details(res).some((e: { field: string }) => e.field === 'token')).toBe(true);
  });

  it('returns 400 when body is empty', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password').send({});
    expect(res.status).toBe(400);
    // Zod v4 reports issues — at minimum 'token' should be missing
    expect(details(res).length).toBeGreaterThan(0);
  });
});
