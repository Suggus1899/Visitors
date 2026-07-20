import { cookies } from 'next/headers';
import type { User } from '../src/types';

/**
 * Server-side session helper.
 *
 * The backend sets an httpOnly `lm_access_token` cookie on login/refresh.
 * We cannot read the JWT payload here (it is opaque to the frontend), but we
 * can detect presence of the cookie to gate SSR rendering.
 *
 * User identity (username/role) is hydrated client-side by AuthProvider from
 * localStorage, which mirrors what the backend returned at login time.
 */
export async function getServerSession(): Promise<{ authenticated: boolean }> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('lm_access_token');
  return { authenticated: !!accessToken };
}

/**
 * Returns the current user if available, or null.
 * On the server we only know whether the user is authenticated (cookie present).
 * Full user data is resolved client-side via AuthProvider.
 */
export async function getServerUser(): Promise<User | null> {
  const { authenticated } = await getServerSession();
  if (!authenticated) return null;
  // User details are hydrated client-side; server cannot decode the opaque cookie.
  return null;
}
