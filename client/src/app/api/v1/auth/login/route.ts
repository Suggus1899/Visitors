import { NextResponse } from 'next/server';
import { clientRequestHeaders, failure, goApiURL, originAllowed, setSessionCookies } from '@/server/auth-cookies';

export async function POST(request: Request) {
  if (!originAllowed(request)) return failure(403, 'FORBIDDEN', 'Origen no autorizado');
  let body: unknown;
  try { body = await request.json(); } catch { return failure(400, 'VALIDATION_ERROR', 'Datos de acceso inválidos'); }
  try {
    const upstream = await fetch(`${goApiURL()}/auth/login`, {
      method: 'POST', headers: clientRequestHeaders(request, { 'Content-Type': 'application/json' }), body: JSON.stringify(body), cache: 'no-store', signal: request.signal,
    });
    const result = await upstream.json() as { success?: boolean; data?: { accessToken?: string; refreshToken?: string; user?: unknown }; error?: unknown };
    if (!upstream.ok || !result.data?.accessToken || !result.data.refreshToken || !result.data.user) {
      return NextResponse.json({ success: false, error: result.error }, { status: upstream.status, headers: { 'Cache-Control': 'private, no-store' } });
    }
    const response = NextResponse.json({ success: true, data: { user: result.data.user } }, { headers: { 'Cache-Control': 'private, no-store' } });
    setSessionCookies(response, result.data.accessToken, result.data.refreshToken);
    return response;
  } catch {
    return failure(503, 'BACKEND_UNAVAILABLE', 'No se pudo conectar con el servicio de acceso');
  }
}
