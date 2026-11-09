import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic gate for signed-in pages (docs/DECISIONS.md D25). It only checks that a Better Auth
 * session cookie is present, so a signed-out visitor is sent to log in before any page code
 * runs. It is not authorization: the API validates the session on every request, and the
 * client guard in app/(app) handles expired or suspended sessions.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
};
