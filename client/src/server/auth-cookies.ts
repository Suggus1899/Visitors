import 'server-only';

import { NextResponse } from 'next/server';

export const accessCookie = '__Host-logmaster-access';
export const refreshCookie = '__Host-logmaster-refresh';

export type CurrentUser = {
  id: number;
  username: string;
  role: 'root' | 'admin' | 'operador' | 'auditor' | 'demo';
  mustChangePassword: boolean;
};

export const goApiURL = () => (process.env.GO_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '') + '/api/v1';

export function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(process.env.APP_URL || 'https://localhost:5173').origin;
  } catch {
    return false;
  }
}

export function failure(status: number, code: string, message: string): Response {
  return Response.json({ success: false, error: { code, message } }, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function tokenMaxAge(token: string): number | undefined {
  try {
    const segment = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as { exp?: number };
    return typeof payload.exp === 'number' ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000)) : undefined;
  } catch {
    return undefined;
  }
}

export function setSessionCookies(response: NextResponse, access: string, refresh: string) {
  const common = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
  const accessAge = tokenMaxAge(access);
  const refreshAge = tokenMaxAge(refresh);
  response.cookies.set(accessCookie, access, { ...common, ...(accessAge === undefined ? {} : { maxAge: accessAge }) });
  response.cookies.set(refreshCookie, refresh, { ...common, ...(refreshAge === undefined ? {} : { maxAge: refreshAge }) });
}

export function clearSessionCookies(response: NextResponse) {
  const common = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 0 };
  response.cookies.set(accessCookie, '', common);
  response.cookies.set(refreshCookie, '', common);
}
