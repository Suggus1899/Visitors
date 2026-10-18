import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { accessCookie, clearSessionCookies, clientRequestHeaders, failure, goApiURL, originAllowed, refreshCookie } from '@/server/auth-cookies';

export async function POST(request: Request) {
  if (!originAllowed(request)) return failure(403, 'FORBIDDEN', 'Origen no autorizado');
  const jar = await cookies();
  const accessToken = jar.get(accessCookie)?.value;
  const refreshToken = jar.get(refreshCookie)?.value;
  let response: NextResponse;
  if (accessToken || refreshToken) {
    try {
      const upstream = await fetch(`${goApiURL()}/auth/logout`, {
        method: 'POST', headers: clientRequestHeaders(request, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ accessToken, refreshToken }), cache: 'no-store', signal: request.signal,
      });
      response = upstream.ok
        ? new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
        : NextResponse.json({ success: false, error: { code: 'SESSION_REVOCATION_FAILED', message: 'No se pudo confirmar el cierre de todas las sesiones' } }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
    } catch {
      response = NextResponse.json({ success: false, error: { code: 'SESSION_REVOCATION_FAILED', message: 'No se pudo confirmar el cierre de todas las sesiones' } }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
    }
  } else {
    response = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  }
  clearSessionCookies(response);
  return response;
}
