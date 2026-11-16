import { getSessionCookie } from 'better-auth/cookies';
import { isIP } from 'node:net';
import { NextResponse, type NextRequest } from 'next/server';

// Headers the API trusts only from this proxy (docs/DECISIONS.md §7 H1, D46). Whatever the
// browser sent under these names is dropped before the request is forwarded.
const CLIENT_IP_HEADER = 'x-uniconnect-client-ip';
const SECRET_HEADER = 'x-uniconnect-proxy-secret';

/**
 * The visitor's address as this deployment can vouch for it. On Vercel the edge overwrites
 * `x-real-ip` and `x-forwarded-for`, so they can't be forged. Outside production (`next dev`,
 * the e2e run) the first forwarded hop is good enough. Anywhere else nothing is sent, and the
 * API falls back to the socket address.
 */
function clientIp(request: NextRequest): string | null {
  const trusted = process.env.VERCEL === '1' || process.env.NODE_ENV !== 'production';
  if (!trusted) return null;
  const candidate =
    request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0];
  const ip = candidate?.trim();
  return ip && isIP(ip) ? ip : null;
}

/** /api/*: forward to Express with the client IP and the shared secret, nothing forged. */
function forwardApi(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  headers.delete(SECRET_HEADER);
  const secret = process.env.PROXY_SHARED_SECRET;
  if (secret) {
    headers.set(SECRET_HEADER, secret);
    const ip = clientIp(request);
    if (ip) headers.set(CLIENT_IP_HEADER, ip);
  }
  return NextResponse.next({ request: { headers } });
}

/**
 * Two jobs. For /api/* it stamps the request for the API (H1 above); the rewrite in
 * next.config.ts then forwards it. For /dashboard it is the optimistic gate for signed-in pages
 * (D25): it only checks that a Better Auth session cookie is present, so a signed-out visitor
 * is sent to log in before any page code runs. It is not authorization: the API validates the
 * session on every request, and the client guard in app/(app) handles expired or suspended
 * sessions.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith('/api/')) return forwardApi(request);

  if (getSessionCookie(request)) return NextResponse.next();
  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*', '/api/:path*'],
};
