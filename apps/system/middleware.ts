import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Public routes that do not require authentication.
 * The operations console (`/`) is protected — all others are auth flows.
 */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public auth routes through. Do NOT redirect /login away just
  // because the lm_access_token cookie is present: that cookie is shared
  // across every app on localhost (cookies aren't port-scoped), while the
  // client-side session lives in this app's own localStorage (refreshToken
  // + role/username, set only by AuthService.login()/AuthContext.login()).
  // A cookie from a sibling app with no matching localStorage here would
  // otherwise create an infinite loop: AuthContext decides there's no user
  // and pushes to /login, this middleware bounces it straight back to /.
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
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
