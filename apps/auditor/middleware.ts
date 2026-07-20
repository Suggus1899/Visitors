import { NextResponse, type NextRequest } from 'next/server';

/**
 * Route protection middleware.
 *
 * The backend sets the `lm_access_token` httpOnly cookie on successful login.
 * Any request to a protected route without that cookie is redirected to /login.
 *
 * Public routes: /login, /select-tenant, and Next.js internal assets.
 */
const PUBLIC_PATHS = ['/login', '/select-tenant'];

const isPublicPath = (pathname: string): boolean => {
    return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
};

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow Next.js static assets and API rewrites through untouched.
    if (pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.includes('.')) {
        return NextResponse.next();
    }

    if (isPublicPath(pathname)) {
        return NextResponse.next();
    }

    const token = request.cookies.get('lm_access_token')?.value;

    if (!token) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    // Run on all paths except Next internals and the proxied API.
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
