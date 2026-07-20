import { cookies } from 'next/headers';

/**
 * Server-side auth helpers.
 *
 * The backend sets an httpOnly `lm_access_token` cookie on login (and clears
 * it on logout). Server Components / middleware read it via `next/headers`.
 * Programmatic API clients still use the Authorization header — both paths are
 * accepted by the backend `verifyToken` middleware.
 */

export interface ServerSession {
  authenticated: boolean;
}

/**
 * Read the access-token cookie. Returns a minimal session object.
 *
 * Note: this only checks for cookie *presence*, not JWT validity. The backend
 * enforces real token validation on every API call; the middleware uses this
 * only to decide whether to redirect unauthenticated users to /login.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = cookies();
  const accessCookie = cookieStore.get('lm_access_token');

  if (!accessCookie?.value) {
    return null;
  }

  return { authenticated: true };
}
