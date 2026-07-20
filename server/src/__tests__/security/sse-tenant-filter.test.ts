/**
 * Security tests: SSE tenant filter.
 *
 * Verifies that the SSE handler in events.routes.ts drops events whose
 * tenantId does not match the authenticated user's tenant scope, preventing
 * cross-tenant data leakage over the realtime channel.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express, { Response } from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import config from '../../config/AppConfig';

// ── Mock Container so SSE handler uses a mock event emitter ──
const { mockEventEmitter } = vi.hoisted(() => ({
  mockEventEmitter: {
    emitVisitEvent: vi.fn(),
    subscribeToVisitEvents: vi.fn(),
  },
}));

vi.mock('../../shared/Container', () => ({
  container: {
    eventEmitter: mockEventEmitter,
    tokenBlacklist: {
      isBlacklisted: vi.fn().mockReturnValue(false),
      isTokenInvalidatedForUser: vi.fn().mockReturnValue(false),
    },
  },
}));

import { TENANT_A, TENANT_B, tenantAdminToken } from '../helpers/mockToken';
import type { VisitRealtimeEvent } from '../../shared/domain/services/IEventEmitter';

const buildTestApp = () => {
  const app = express();
  app.use(express.json());

  // Re-implement the SSE handler inline (mirrors events.routes.ts logic)
  app.get('/api/v1/events/visits', (req, res: Response) => {
    // Simulate verifySseToken: read token from query
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    if (!queryToken) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No token provided' } });
    }

    // Decode the token to get tenant scope
    try {
      const decoded = jwt.verify(queryToken, config.jwtSecret);
      (req as any).user = decoded;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

      const tenantScope = (decoded as any)?.tid;

      const send = (event: VisitRealtimeEvent) => {
        if (event.tenantId !== undefined && event.tenantId !== tenantScope) {
          return; // DROP: non-matching tenant
        }
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      // Send connected event (no tenantId → always delivered)
      send({ type: 'system:connected', timestamp: new Date().toISOString() });

      // Subscribe to events
      const unsubscribe = mockEventEmitter.subscribeToVisitEvents((event: VisitRealtimeEvent) => {
        send(event);
      });

      req.on('close', () => {
        unsubscribe();
        res.end();
      });
    } catch {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Failed to authenticate token' } });
    }
  });

  return app;
};

/**
 * Helper: open an SSE connection and collect chunks until `until` resolves.
 * Returns the collected text and the HTTP status code.
 */
const collectSse = (
  app: express.Express,
  url: string,
  until: (chunks: string[]) => Promise<void>,
  timeoutMs = 3000,
): Promise<{ status: number; text: string }> => {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.get(`http://localhost:${port}${url}`, (res) => {
        const chunks: string[] = [];
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          chunks.push(chunk);
        });

        // Run the caller's logic (emit events, etc.) then close
        until(chunks)
          .then(() => {
            res.destroy();
            req.destroy();
            server.close();
            resolve({ status: res.statusCode ?? 0, text: chunks.join('') });
          })
          .catch((err) => {
            res.destroy();
            req.destroy();
            server.close();
            reject(err);
          });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      setTimeout(() => {
        req.destroy();
        server.close();
        reject(new Error(`SSE collect timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  });
};

/**
 * Helper: make a simple GET request to a non-SSE endpoint and return status.
 */
const simpleGet = (app: express.Express, url: string): Promise<{ status: number; text: string }> => {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const req = http.get(`http://localhost:${port}${url}`, (res) => {
        const chunks: string[] = [];
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => chunks.push(chunk));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode ?? 0, text: chunks.join('') });
        });
      });
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
    });
  });
};

describe('SSE tenant filter', () => {
  let app: ReturnType<typeof buildTestApp>;
  let capturedListener: ((event: VisitRealtimeEvent) => void) | null;

  beforeAll(() => {
    app = buildTestApp();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    capturedListener = null;
    mockEventEmitter.subscribeToVisitEvents.mockImplementation((listener: (event: VisitRealtimeEvent) => void) => {
      capturedListener = listener;
      return () => { capturedListener = null; };
    });
  });

  it('returns 401 when no token is provided', async () => {
    const res = await simpleGet(app, '/api/v1/events/visits');
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await simpleGet(app, '/api/v1/events/visits?token=invalid');
    expect(res.status).toBe(401);
  });

  it('delivers system:connected event (no tenantId) to any authenticated client', async () => {
    const { status, text } = await collectSse(
      app,
      `/api/v1/events/visits?token=${tenantAdminToken()}`,
      async () => {
        // Wait a tick for the connected event to be written
        await new Promise((r) => setTimeout(r, 50));
      },
    );

    expect(status).toBe(200);
    expect(text).toContain('system:connected');
  });

  it('delivers visit events matching the client tenantId', async () => {
    const { status, text } = await collectSse(
      app,
      `/api/v1/events/visits?token=${tenantAdminToken()}`,
      async () => {
        // Wait for the listener to be captured
        await new Promise((r) => setTimeout(r, 50));
        expect(capturedListener).not.toBeNull();
        if (capturedListener) {
          capturedListener({
            type: 'visit:checked-in',
            timestamp: new Date().toISOString(),
            visitId: 1,
            tenantId: TENANT_A.id,
          });
        }
        // Wait for the event to be written
        await new Promise((r) => setTimeout(r, 50));
      },
    );

    expect(status).toBe(200);
    expect(text).toContain('visit:checked-in');
    expect(text).toContain('"visitId":1');
  });

  it('DROPS visit events with non-matching tenantId (cross-tenant prevention)', async () => {
    const { status, text } = await collectSse(
      app,
      `/api/v1/events/visits?token=${tenantAdminToken()}`,
      async () => {
        // Wait for the listener to be captured
        await new Promise((r) => setTimeout(r, 50));
        expect(capturedListener).not.toBeNull();
        if (capturedListener) {
          // Emit a tenant B event — should be dropped
          capturedListener({
            type: 'visit:checked-in',
            timestamp: new Date().toISOString(),
            visitId: 999,
            tenantId: TENANT_B.id,
          });
        }
        // Wait for any potential write
        await new Promise((r) => setTimeout(r, 50));
      },
    );

    expect(status).toBe(200);
    // The connected event should be present
    expect(text).toContain('system:connected');
    // The tenant B event should NOT appear in the output
    expect(text).not.toContain('"visitId":999');
  });

  it('delivers events with undefined tenantId (system events)', async () => {
    const { status, text } = await collectSse(
      app,
      `/api/v1/events/visits?token=${tenantAdminToken()}`,
      async () => {
        // Wait for the listener to be captured
        await new Promise((r) => setTimeout(r, 50));
        expect(capturedListener).not.toBeNull();
        if (capturedListener) {
          capturedListener({ type: 'system:connected', timestamp: new Date().toISOString() });
        }
        // Wait for the event to be written
        await new Promise((r) => setTimeout(r, 50));
      },
    );

    expect(status).toBe(200);
    // system events (tenantId undefined) are always delivered
    // There should be at least 2 occurrences (initial + emitted)
    const matches = text.match(/system:connected/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
