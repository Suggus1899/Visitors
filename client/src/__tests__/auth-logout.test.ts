import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieJar } = vi.hoisted(() => ({ cookieJar: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: cookieJar }));

import { POST } from '../app/api/v1/auth/logout/route';

const fetchMock = vi.fn();
const request = () => new Request('https://localhost:5173/api/v1/auth/logout', {
  method: 'POST', headers: { origin: 'https://localhost:5173' },
});

describe('logout BFF', () => {
  beforeEach(() => {
    vi.stubEnv('APP_URL', 'https://localhost:5173');
    vi.stubEnv('GO_API_URL', 'http://127.0.0.1:3000');
    vi.stubGlobal('fetch', fetchMock);
    cookieJar.mockResolvedValue({ get: (name: string) => ({ value: name.endsWith('access') ? 'access-fixture' : 'refresh-fixture' }) });
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('revokes server sessions with HttpOnly cookie tokens and clears both cookies', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const response = await POST(request());
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, string>;
    const cookies = response.headers.get('set-cookie') || '';

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3000/api/v1/auth/logout', expect.any(Object));
    expect(sent).toEqual({ accessToken: 'access-fixture', refreshToken: 'refresh-fixture' });
    expect(JSON.stringify(await response.text())).not.toMatch(/access-fixture|refresh-fixture/);
    expect(cookies).toContain('__Host-logmaster-access=');
    expect(cookies).toContain('__Host-logmaster-refresh=');
    expect(cookies).toContain('Max-Age=0');
  });

  it('clears cookies but reports when server revocation cannot be confirmed', async () => {
    fetchMock.mockRejectedValue(new Error('backend unavailable'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
