import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthService from '../services/AuthService';
import api from '../services/api.v1';

vi.mock('../services/api.v1', () => ({ default: { post: vi.fn() } }));

const user = { id: 7, username: 'admin', role: 'admin', mustChangePassword: false };

describe('AuthService with HttpOnly session cookies', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => window.dispatchEvent(new Event('auth:logout')));

  it('returns only the user from login and never stores tokens in browser storage', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { user } } } as never);

    await expect(AuthService.login('admin', 'password')).resolves.toEqual(user);
    expect(api.post).toHaveBeenCalledWith('/auth/login', { username: 'admin', password: 'password' });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('shares a concurrent refresh and sends no token in the request body', async () => {
    let resolve!: (value: unknown) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise(done => { resolve = done; }) as never);
    const first = AuthService.refreshAccessToken();
    const second = AuthService.refreshAccessToken();

    expect(second).toBe(first);
    expect(api.post).toHaveBeenCalledOnce();
    expect(api.post).toHaveBeenCalledWith('/auth/refresh');
    resolve({ data: { success: true } });
    await expect(first).resolves.toBeUndefined();
  });

  it('announces logout even when the BFF request fails', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('network unavailable'));
    const onLogout = vi.fn();
    window.addEventListener('auth:logout', onLogout, { once: true });

    await expect(AuthService.logout()).rejects.toThrow('network unavailable');
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(onLogout).toHaveBeenCalledOnce();
    expect(localStorage.length).toBe(0);
  });
});
