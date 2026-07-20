import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_PATHS } from '@/types';

/**
 * Platform user shape stored in the session.
 */
export interface PlatformUser {
  id: string;
  email: string;
  username: string;
  role: string;
  isSuperAdmin: boolean;
}

const ACCESS_COOKIE = 'lm_access_token';
const REFRESH_COOKIE = 'lm_refresh_token';
const USER_COOKIE = 'lm_user';

/**
 * Read the current superadmin session on the server.
 *
 * The access token lives in an httpOnly cookie set by the backend on login.
 * The user object is mirrored in a non-httpOnly cookie so server components
 * can render the UI without an extra round-trip.
 */
export async function getServerSession(): Promise<{ user: PlatformUser } | null> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const userRaw = cookieStore.get(USER_COOKIE)?.value;

  if (!accessToken || !userRaw) {
    return null;
  }

  try {
    const user = JSON.parse(userRaw) as PlatformUser;
    if (!user.isSuperAdmin) {
      return null;
    }
    return { user };
  } catch {
    return null;
  }
}

/**
 * Require an authenticated superadmin session on the server.
 * Redirects to /login when absent.
 */
export async function requireServerSession(): Promise<{ user: PlatformUser }> {
  const session = await getServerSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

export const AUTH_COOKIES = {
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
  user: USER_COOKIE,
} as const;

export { API_PATHS };
