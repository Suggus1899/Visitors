import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/v1/auth/login/route';

vi.mock('server-only', () => ({}));

const fetchMock = vi.fn();
const request = (origin = 'https://localhost:5173') => new Request('https://localhost:5173/api/v1/auth/login', {
  method: 'POST',
  headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'operator', password: 'correct-horse' }),
});

describe('Next.js authentication BFF', () => {
  beforeEach(() => {
    vi.stubEnv('APP_URL', 'https://localhost:5173');
    vi.stubEnv('GO_API_URL', 'http://127.0.0.1:3000');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sets secure HttpOnly cookies and returns no bearer tokens to JavaScript', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: {
      accessToken: 'access.secret.token',
      refreshToken: 'refresh.secret.token',
      user: { id: 3, username: 'operator', role: 'operador', mustChangePassword: false },
    } }));

    const response = await POST(request());
    const body = await response.json();
    const cookies = response.headers.get('set-cookie') || '';

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3000/api/v1/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(body.data.user.username).toBe('operator');
    expect(JSON.stringify(body)).not.toMatch(/accessToken|refreshToken|access\.secret|refresh\.secret/);
    expect(cookies).toContain('__Host-logmaster-access=access.secret.token');
    expect(cookies).toContain('__Host-logmaster-refresh=refresh.secret.token');
    expect(cookies).toContain('HttpOnly');
    expect(cookies).toContain('Secure');
    expect(cookies).toContain('SameSite=lax');
    expect(cookies).toContain('Path=/');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('rejects a forged origin before contacting Go', async () => {
    const response = await POST(request('https://attacker.example'));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
