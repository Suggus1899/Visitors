import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Route protection middleware.
 *
 * Redirects unauthenticated requests to /login. The backend sets an httpOnly
 * `lm_access_token` cookie on login; we check for its presence here. Real token
 * validity is enforced by the backend on every API call.
 *
 * Public routes: /login and Next internals (_next, favicon, etc.).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('lm_access_token')?.value;

  // Allow public routes
  if (pathname === '/login' || pathname === '/select-tenant') {
    // If already authenticated and visiting /login, send to dashboard
    if (token && pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Protected route — require access cookie
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except Next internals, static assets, and the API
  // (rewrites proxy /api → backend; middleware must not intercept auth/login
  // API calls that have no cookie yet).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
