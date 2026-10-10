import { NextResponse } from 'next/server';
import { clearSessionCookies, failure, originAllowed } from '@/server/auth-cookies';

export async function POST(request: Request) {
  if (!originAllowed(request)) return failure(403, 'FORBIDDEN', 'Origen no autorizado');
  const response = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  clearSessionCookies(response);
  return response;
}
