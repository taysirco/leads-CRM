import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const token = req.cookies.get('auth_token');
  const { pathname } = req.nextUrl;

  // Allow requests for API, static files, and the login page to pass through
  if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname.startsWith('/static') || pathname === '/login') {
    return NextResponse.next();
  }

  // If trying to access any other page without a token, redirect to login
  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // If token exists, allow access
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: '/:path*',
} 