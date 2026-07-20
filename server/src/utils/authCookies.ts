import { Response } from 'express';
import config from '../config/AppConfig';

/**
 * Cookie names used for hybrid cookie+header auth.
 * - access_token: short-lived JWT access token (httpOnly, SameSite=Lax)
 * - refresh_token: long-lived JWT refresh token (httpOnly, SameSite=Lax, path=/api/v1/auth)
 *
 * Server Components in Next.js read these via `next/headers` cookies().
 * Programmatic API clients (webhooks, integrations) continue to use the
 * Authorization header — both paths are accepted by verifyToken.
 */
export const ACCESS_COOKIE = 'lm_access_token';
export const REFRESH_COOKIE = 'lm_refresh_token';

const isProd = config.nodeEnv === 'production';
const secure = isProd;
const sameSite = isProd ? 'strict' : 'lax';

const ACCESS_MAX_AGE = 15 * 60; // 15 minutes — matches JWT_ACCESS_EXPIRATION
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60; // 7 days — matches JWT_REFRESH_EXPIRATION

export const setAuthCookies = (res: Response, accessToken: string, refreshToken?: string): void => {
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: ACCESS_MAX_AGE * 1000,
    path: '/',
  });

  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: REFRESH_MAX_AGE * 1000,
      // Scope refresh cookie to auth endpoints only — reduces exposure surface.
      path: '/api/v1/auth',
    });
  }
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
};
