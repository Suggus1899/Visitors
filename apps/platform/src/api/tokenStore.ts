/**
 * Token storage for the platform superadmin session.
 *
 * Access tokens are kept in memory only (never persisted) to limit the blast
 * radius of XSS. Refresh tokens are persisted in localStorage so a page reload
 * can restore the session.
 */

const ACCESS_TOKEN_KEY = 'platform:accessToken';
const REFRESH_TOKEN_KEY = 'platform:refreshToken';
const USER_KEY = 'platform:user';

export const tokenStore = {
  getAccessToken(): string | null {
    try {
      return sessionStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setAccessToken(token: string): void {
    try {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    } catch {
      // Storage may be unavailable (private mode); ignore.
    }
  },
  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  setRefreshToken(token: string): void {
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } catch {
      // ignore
    }
  },
  getUser<T>(): T | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  setUser(user: unknown): void {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // ignore
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // ignore
    }
  },
};
