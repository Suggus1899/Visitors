/**
 * Integration tests for visit routes.
 * Isolated Express app — no DB. Tests auth gate (401) and Zod validation (400).
 * Response shape from validate middleware: { success, error: { code, message, details } }
 */
import { describe, it, expect, beforeAll } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { checkInSchema } from '../../schemas/visit.schema';
import { errorHandler } from '../../middleware/error';

const fakeAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers.authorization === 'Bearer valid-token') return next();
  res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Missing or invalid token' });
};

const buildTestApp = () => {
  const app = express();
  app.use(express.json());

  app.post('/api/v1/visits/checkin', fakeAuth, validate(checkInSchema),
    asyncHandler(async (_req, res) => res.status(201).json({ success: true, data: { id: 1 } }))
  );
  app.get('/api/v1/visits/active', fakeAuth,
    asyncHandler(async (_req, res) => res.json({ success: true, data: [] }))
  );

  app.use(errorHandler);
  return app;
};

/** Extract error.details from response */
const details = (res: request.Response) => res.body?.error?.details ?? [];

const VALID_PAYLOAD = {
  visitorCedula: '12345678',
  consent: {
    accepted: true,
    policyVersion: '1.0',
    acceptedAt: '2026-03-11T10:00:00.000Z'
  },
  purpose: 'Reunión',
  personToVisit: 'Recepcion'
};

let app: ReturnType<typeof buildTestApp>;
beforeAll(() => { app = buildTestApp(); });

// ──────────────────────────────────────────────────
// POST /api/v1/visits/checkin
// ──────────────────────────────────────────────────
describe('POST /api/v1/visits/checkin', () => {
  it('returns 401 without auth header', async () => {
    const res = await request(app).post('/api/v1/visits/checkin').send(VALID_PAYLOAD);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 401 with invalid token', async () => {
    const res = await request(app).post('/api/v1/visits/checkin')
      .set('Authorization', 'Bearer bad-token').send(VALID_PAYLOAD);
    expect(res.status).toBe(401);
  });

  it('returns 201 when authenticated with valid payload', async () => {
    const res = await request(app).post('/api/v1/visits/checkin')
      .set('Authorization', 'Bearer valid-token').send(VALID_PAYLOAD);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 when visitorCedula is missing', async () => {
    const res = await request(app).post('/api/v1/visits/checkin')
      .set('Authorization', 'Bearer valid-token')
      .send({
        consent: VALID_PAYLOAD.consent,
        purpose: 'Reunión',
        personToVisit: 'Recepcion'
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(details(res).some((e: { field: string }) => e.field === 'visitorCedula')).toBe(true);
  });

  it('returns 400 when purpose is missing', async () => {
    const res = await request(app).post('/api/v1/visits/checkin')
      .set('Authorization', 'Bearer valid-token')
      .send({
        visitorCedula: '12345678',
        consent: VALID_PAYLOAD.consent,
        personToVisit: 'Recepcion'
      });
    expect(res.status).toBe(400);
    expect(details(res).some((e: { field: string }) => e.field === 'purpose')).toBe(true);
  });

  it('returns 400 when body is completely empty', async () => {
    const res = await request(app).post('/api/v1/visits/checkin')
      .set('Authorization', 'Bearer valid-token').send({});
    expect(res.status).toBe(400);
    const fields = details(res).map((e: { field: string }) => e.field);
    expect(fields).toContain('visitorCedula');
    expect(fields).toContain('purpose');
    expect(fields).toContain('personToVisit');
  });

  it('returns 400 when email in visitorData is invalid', async () => {
    const res = await request(app).post('/api/v1/visits/checkin')
      .set('Authorization', 'Bearer valid-token')
      .send({ ...VALID_PAYLOAD, visitorData: { email: 'bad-email' } });
    expect(res.status).toBe(400);
    expect(details(res).some((e: { field: string }) => e.field.includes('email'))).toBe(true);
  });

  it('returns 201 with optional visitorData included', async () => {
    const res = await request(app).post('/api/v1/visits/checkin')
      .set('Authorization', 'Bearer valid-token')
      .send({ ...VALID_PAYLOAD, notes: 'VIP', visitorData: { firstName: 'Juan', email: 'j@acme.com' } });
    expect(res.status).toBe(201);
  });
});

// ──────────────────────────────────────────────────
// GET /api/v1/visits/active
// ──────────────────────────────────────────────────
describe('GET /api/v1/visits/active', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/v1/visits/active');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid auth', async () => {
    const res = await request(app).get('/api/v1/visits/active')
      .set('Authorization', 'Bearer valid-token');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
  });
});
