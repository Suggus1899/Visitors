import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { accessCookie, clearSessionCookies, failure, goApiURL, originAllowed, refreshCookie, setSessionCookies, type CurrentUser } from '@/server/auth-cookies';

type Context = { params: Promise<{ path: string[] }> };
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'set-cookie', 'server', 'date']);

type SessionTokens = { accessToken: string; refreshToken: string; user: CurrentUser };

async function refreshTokens(refreshToken: string, signal: AbortSignal): Promise<SessionTokens | null> {
  const response = await fetch(`${goApiURL()}/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }), cache: 'no-store', signal,
  });
  const result = await response.json() as { data?: { accessToken?: string; refreshToken?: string; user?: CurrentUser }; error?: unknown };
  if (!response.ok || !result.data?.accessToken || !result.data.refreshToken || !result.data.user) return null;
  return {
    accessToken: result.data.accessToken,
    refreshToken: result.data.refreshToken,
    user: result.data.user,
  };
}

async function proxy(request: Request, context: Context) {
  const { path } = await context.params;
  if (!path.length || path.some(part => !part || part === '.' || part === '..' || part.includes('/') || part.includes('\\'))) {
    return failure(404, 'NOT_FOUND', 'Ruta no encontrada');
  }
  if (!['GET', 'HEAD'].includes(request.method) && !originAllowed(request)) {
    return failure(403, 'FORBIDDEN', 'Origen no autorizado');
  }

  const target = new URL(`${goApiURL()}/${path.map(encodeURIComponent).join('/')}`);
  target.search = new URL(request.url).search;
  const incomingCookies = await cookies();
  let access = incomingCookies.get(accessCookie)?.value;
  const refresh = incomingCookies.get(refreshCookie)?.value;
  let tokens: Awaited<ReturnType<typeof refreshTokens>> = null;

  const send = (token?: string) => {
    const headers = new Headers();
    for (const name of ['accept', 'content-type', 'range', 'if-none-match', 'if-modified-since', 'user-agent']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const clientIP = request.headers.get('x-real-ip');
    if (clientIP) headers.set('X-Forwarded-For', clientIP);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const body = ['GET', 'HEAD'].includes(request.method) ? undefined : request.body;
    return fetch(target, { method: request.method, headers, body, cache: 'no-store', redirect: 'manual', signal: request.signal, ...(body ? { duplex: 'half' as const } : {}) });
  };

  try {
    let upstream = await send(access);
    if (upstream.status === 401 && access && refresh && ['GET', 'HEAD'].includes(request.method)) {
      const body = await upstream.clone().json().catch(() => null) as { error?: { code?: string } } | null;
      if (body?.error?.code === 'UNAUTHORIZED') {
        tokens = await refreshTokens(refresh, request.signal);
        if (tokens) {
          access = tokens.accessToken;
          upstream = await send(access);
        }
      }
    }

    const headers = new Headers({ 'Cache-Control': 'private, no-store' });
    upstream.headers.forEach((value, name) => { if (!hopHeaders.has(name.toLowerCase())) headers.set(name, value); });
    const response = new NextResponse(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
    if (tokens) setSessionCookies(response, tokens.accessToken, tokens.refreshToken);
    if (upstream.status === 200 && target.pathname.endsWith('/auth/change-password')) clearSessionCookies(response);
    return response;
  } catch {
    return failure(503, 'BACKEND_UNAVAILABLE', 'El servicio no está disponible');
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
