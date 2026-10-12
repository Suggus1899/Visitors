import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { clearSessionCookies, clientRequestHeaders, failure, goApiURL, originAllowed, refreshCookie, setSessionCookies } from '@/server/auth-cookies';

export async function POST(request: Request) {
  if (!originAllowed(request)) return failure(403, 'FORBIDDEN', 'Origen no autorizado');
  const jar = await cookies();
  const refreshToken = jar.get(refreshCookie)?.value;
  if (!refreshToken) {
    const response = failure(401, 'INVALID_TOKEN', 'Sesión vencida');
    const next = NextResponse.json(await response.json(), { status: response.status, headers: response.headers });
    clearSessionCookies(next);
    return next;
  }
  try {
    const upstream = await fetch(`${goApiURL()}/auth/refresh`, {
      method: 'POST', headers: clientRequestHeaders(request, { 'Content-Type': 'application/json' }), body: JSON.stringify({ refreshToken }), cache: 'no-store', signal: request.signal,
    });
    const result = await upstream.json() as { data?: { accessToken?: string; refreshToken?: string; user?: unknown }; error?: unknown };
    if (!upstream.ok || !result.data?.accessToken || !result.data.refreshToken || !result.data.user) {
      const response = NextResponse.json({ success: false, error: result.error }, { status: upstream.status, headers: { 'Cache-Control': 'private, no-store' } });
      if (upstream.status === 401) clearSessionCookies(response);
      return response;
    }
    const response = NextResponse.json({ success: true, data: { user: result.data.user } }, { headers: { 'Cache-Control': 'private, no-store' } });
    setSessionCookies(response, result.data.accessToken, result.data.refreshToken);
    return response;
  } catch {
    return failure(503, 'BACKEND_UNAVAILABLE', 'No se pudo renovar la sesión');
  }
}
