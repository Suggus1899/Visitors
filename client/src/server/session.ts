import 'server-only';

import { cookies, headers as requestHeaders } from 'next/headers';
import { redirect } from 'next/navigation';
import { accessCookie, type CurrentUser, goApiURL, refreshCookie, safeRequestId } from './auth-cookies';
import { cache } from 'react';

export const readCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(accessCookie)?.value;
  if (!token) return null;
  try {
    const incomingHeaders = await requestHeaders();
    const clientIP = incomingHeaders.get('x-real-ip');
    const requestId = safeRequestId(incomingHeaders.get('x-request-id'));
    const response = await fetch(`${goApiURL()}/auth/session`, {
      headers: { Authorization: `Bearer ${token}`, ...(clientIP ? { 'X-Forwarded-For': clientIP } : {}), ...(requestId ? { 'X-Request-ID': requestId } : {}) }, cache: 'no-store',
    });
    if (!response.ok) return null;
    const result = await response.json() as { data?: { user?: CurrentUser } };
    return result.data?.user ?? null;
  } catch {
    return null;
  }
});

export async function requireUser(path: string, roles?: CurrentUser['role'][]): Promise<CurrentUser> {
  const user = await readCurrentUser();
  if (!user) {
    const hasRefresh = (await cookies()).has(refreshCookie);
    if (hasRefresh) redirect(`/auth/renew?returnTo=${encodeURIComponent(path)}`);
    redirect('/login');
  }
  if (user.mustChangePassword && path !== '/change-password') redirect('/change-password');
  if (roles && !roles.includes(user.role)) {
    if (user.role === 'auditor') redirect('/audit');
    if (user.role === 'root') redirect('/root');
    redirect('/');
  }
  return user;
}
