import { describe, it, expect, beforeAll } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { validate } from '../../middleware/validate';
import {
  createArcoRequestSchema,
  updateArcoStatusSchema,
  rectifyDataSchema,
  oppositionSchema
} from '../../schemas/privacy.schema';
import { errorHandler } from '../../middleware/error';

type Role = 'admin' | 'operador' | 'auditor';

const fakeAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;

  if (auth === 'Bearer admin-token') {
    req.user = { id: 1, username: 'admin', role: 'admin' };
    return next();
  }
  if (auth === 'Bearer guard-token') {
    req.user = { id: 2, username: 'operador', role: 'operador' };
    return next();
  }
  if (auth === 'Bearer auditor-token') {
    req.user = { id: 3, username: 'auditor', role: 'auditor' };
    return next();
  }

  return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
};

const requireRole = (allowed: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req.user as { role?: Role } | undefined)?.role;
    if (!role || !allowed.includes(role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
    }
    next();
  };
};

const buildApp = () => {
  const app = express();
  app.use(express.json());

  app.post('/api/v1/privacy/arco-requests', fakeAuth, validate(createArcoRequestSchema), (_req, res) => {
    res.status(201).json({ success: true, data: { id: 1, status: 'pending' } });
  });

  app.get('/api/v1/privacy/arco-requests', fakeAuth, requireRole(['admin', 'auditor']), (_req, res) => {
    res.json({ success: true, data: { requests: [] } });
  });

  app.patch('/api/v1/privacy/arco-requests/:id/status', fakeAuth, requireRole(['admin', 'auditor']), validate(updateArcoStatusSchema), (_req, res) => {
    res.json({ success: true, data: { id: 1, status: 'completed' } });
  });

  app.patch('/api/v1/privacy/subjects/:cedula', fakeAuth, requireRole(['admin', 'operador']), validate(rectifyDataSchema), (_req, res) => {
    res.json({ success: true, data: { message: 'ok' } });
  });

  app.post('/api/v1/privacy/subjects/:cedula/opposition', fakeAuth, validate(oppositionSchema), (_req, res) => {
    res.status(201).json({ success: true, data: { id: 2, status: 'pending' } });
  });

  app.use(errorHandler);
  return app;
};

let app: ReturnType<typeof buildApp>;

beforeAll(() => {
  app = buildApp();
});

describe('privacy routes contract', () => {
  it('POST /arco-requests returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/v1/privacy/arco-requests')
      .send({ requestType: 'access', cedula: '123', requestedByName: 'Test' });

    expect(res.status).toBe(401);
  });

  it('POST /arco-requests returns 400 for invalid payload', async () => {
    const res = await request(app)
      .post('/api/v1/privacy/arco-requests')
      .set('Authorization', 'Bearer admin-token')
      .send({ requestType: 'access', requestedByName: 'Test' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /arco-requests returns 201 for valid payload', async () => {
    const res = await request(app)
      .post('/api/v1/privacy/arco-requests')
      .set('Authorization', 'Bearer guard-token')
      .send({ requestType: 'access', cedula: '12345678', requestedByName: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('GET /arco-requests blocks guard role', async () => {
    const res = await request(app)
      .get('/api/v1/privacy/arco-requests')
      .set('Authorization', 'Bearer guard-token');

    expect(res.status).toBe(403);
  });

  it('GET /arco-requests allows auditor role', async () => {
    const res = await request(app)
      .get('/api/v1/privacy/arco-requests')
      .set('Authorization', 'Bearer auditor-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('PATCH /arco-requests/:id/status validates body', async () => {
    const res = await request(app)
      .patch('/api/v1/privacy/arco-requests/1/status')
      .set('Authorization', 'Bearer admin-token')
      .send({ status: 'done' });

    expect(res.status).toBe(400);
  });

  it('PATCH /subjects/:cedula rejects empty rectification', async () => {
    const res = await request(app)
      .patch('/api/v1/privacy/subjects/12345678')
      .set('Authorization', 'Bearer guard-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('POST /subjects/:cedula/opposition accepts valid payload', async () => {
    const res = await request(app)
      .post('/api/v1/privacy/subjects/12345678/opposition')
      .set('Authorization', 'Bearer admin-token')
      .send({ requestedByName: 'Juan Perez', reason: 'No marketing' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
