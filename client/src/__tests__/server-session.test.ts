import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { cookieJar, requestHeaders } = vi.hoisted(() => ({
  cookieJar: vi.fn(),
  requestHeaders: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: cookieJar, headers: requestHeaders }));

import { readCurrentUser } from '../server/session';

const fetchMock = vi.fn();

describe('server session lookup', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    cookieJar.mockResolvedValue({ get: () => ({ value: 'fixture-access-token' }) });
    requestHeaders.mockResolvedValue(new Headers({ 'x-real-ip': '203.0.113.8', 'x-forwarded-for': '198.51.100.77', 'x-request-id': 'b'.repeat(32) }));
    fetchMock.mockResolvedValue(Response.json({ data: { user: { id: 1, username: 'operator', role: 'operador' } } }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('forwards only the proxy supplied client IP to Go', async () => {
    await readCurrentUser();

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(options.headers);
    expect(headers.get('authorization')).toBe('Bearer fixture-access-token');
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.8');
    expect(headers.get('x-request-id')).toBe('b'.repeat(32));
    expect(options.cache).toBe('no-store');
  });

  it('does not call Go for a request without a session cookie', async () => {
    cookieJar.mockResolvedValue({ get: () => undefined });

    await expect(readCurrentUser()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats an invalid session cookie as an anonymous request', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(readCurrentUser()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

});
