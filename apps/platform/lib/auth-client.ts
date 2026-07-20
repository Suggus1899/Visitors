'use client';

import { API_PATHS } from '@/types';
import type { PlatformUser } from './auth';

/**
 * Client-side auth helpers for the platform superadmin console.
 *
 * All requests use relative `/api/v1/...` URLs so the Next.js rewrites proxy
 * them to the backend on the same origin — httpOnly cookies flow automatically.
 */

const ACCESS_COOKIE = 'lm_access_token';
const USER_COOKIE = 'lm_user';

/** Read a cookie value by name (client-side). */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Best-effort check of whether the access cookie is present. */
export function hasSessionCookie(): boolean {
  return !!getCookie(ACCESS_COOKIE);
}

/** Read the mirrored user object from the client cookie. */
export function getClientUser(): PlatformUser | null {
  const raw = getCookie(USER_COOKIE);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlatformUser;
  } catch {
    return null;
  }
}

export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * POST /api/v1/auth/login — the backend sets httpOnly cookies.
 * Returns the user object so the caller can show a toast / redirect.
 */
export async function login(payload: LoginPayload): Promise<PlatformUser> {
  const res = await fetch(API_PATHS.login, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username: payload.email, password: payload.password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? body?.message ?? 'Login failed.');
  }

  const envelope = await res.json();
  const data = envelope?.data ?? envelope;
  const user = data?.user;
  const isSuperAdmin = user?.isSuperAdmin ?? user?.role === 'root';
  if (!isSuperAdmin) {
    throw new Error('Access denied. Superadmin privileges required.');
  }

  return {
    id: user.username,
    email: user.email ?? payload.email,
    username: user.username,
    role: user.role,
    isSuperAdmin: true,
  } as PlatformUser;
}

/** POST /api/v1/auth/logout — the backend clears the cookies. */
export async function logout(): Promise<void> {
  try {
    await fetch(API_PATHS.logout, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Best-effort — the cookie may already be gone.
  }
}

/** POST /api/v1/auth/refresh — refresh the access token via cookie. */
export async function refreshToken(): Promise<void> {
  await fetch(API_PATHS.refresh, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
}
