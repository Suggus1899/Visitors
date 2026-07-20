import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { correlationId, enrichCorrelationContext } from '../../middleware/correlationId';
import { getCorrelationContext, correlationStorage } from '../../shared/correlationStorage';

const buildApp = () => {
  const app = express();
  app.use(correlationId);
  app.get('/ctx', (_req, res) => {
    const ctx = getCorrelationContext();
    res.json(ctx ?? {});
  });
  app.get('/enriched', (_req, res) => {
    enrichCorrelationContext({ tenantId: 42, userId: 7 });
    const ctx = getCorrelationContext();
    res.json(ctx ?? {});
  });
  return app;
};

describe('correlationId middleware', () => {
  it('generates a correlationId when no x-request-id header is present', async () => {
    const res = await request(buildApp()).get('/ctx');
    expect(res.status).toBe(200);
    expect(res.body.correlationId).toMatch(/^[a-f0-9]{32}$/);
    expect(res.setHeader).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/^[a-f0-9]{32}$/);
  });

  it('reuses a valid incoming x-request-id header', async () => {
    const incoming = 'abc-123-def';
    const res = await request(buildApp()).get('/ctx').set('x-request-id', incoming);
    expect(res.status).toBe(200);
    expect(res.body.correlationId).toBe(incoming);
    expect(res.headers['x-request-id']).toBe(incoming);
  });

  it('rejects an invalid x-request-id and generates a fresh one (log injection guard)', async () => {
    // Spaces are not allowed by our regex but Node accepts them in header values
    const malicious = 'abc def ghi';
    const res = await request(buildApp()).get('/ctx').set('x-request-id', malicious);
    expect(res.status).toBe(200);
    expect(res.body.correlationId).not.toBe(malicious);
    expect(res.body.correlationId).toMatch(/^[a-f0-9]{32}$/);
  });

  it('rejects an over-long x-request-id and generates a fresh one', async () => {
    const tooLong = 'a'.repeat(200);
    const res = await request(buildApp()).get('/ctx').set('x-request-id', tooLong);
    expect(res.status).toBe(200);
    expect(res.body.correlationId).not.toBe(tooLong);
    expect(res.body.correlationId).toMatch(/^[a-f0-9]{32}$/);
  });

  it('enrichCorrelationContext adds tenantId and userId to the store', async () => {
    const res = await request(buildApp()).get('/enriched');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(42);
    expect(res.body.userId).toBe(7);
    expect(res.body.correlationId).toMatch(/^[a-f0-9]{32}$/);
  });

  it('getCorrelationContext returns undefined outside a request', () => {
    expect(getCorrelationContext()).toBeUndefined();
  });

  it('enrichCorrelationContext is a no-op outside a request context', () => {
    expect(() => enrichCorrelationContext({ tenantId: 1 })).not.toThrow();
    expect(getCorrelationContext()).toBeUndefined();
  });
});
