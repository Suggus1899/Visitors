import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'lm_access_token';
const PUBLIC_PATHS = ['/login'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths without auth.
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    // If already authenticated and visiting /login, redirect to dashboard.
    if (pathname === '/login' && request.cookies.get(ACCESS_COOKIE)?.value) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Protect everything else.
  const hasAccess = !!request.cookies.get(ACCESS_COOKIE)?.value;
  if (!hasAccess) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Match all paths except static assets, Next internals, and API proxy routes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
