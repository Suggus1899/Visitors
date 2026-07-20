import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Public routes that do not require authentication.
 * The operations console (`/`) is protected — all others are auth flows.
 */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public auth routes through
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    // If already authenticated and visiting /login, redirect to operations
    if (pathname === '/login' && request.cookies.get('lm_access_token')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Protected routes: require the httpOnly access-token cookie set by the backend
  const accessToken = request.cookies.get('lm_access_token');
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static assets, Next internals, and API rewrites
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png|api).*)'],
};
