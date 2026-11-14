/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

// better-auth is ESM-only; the gate only needs to know whether the session cookie is there.
jest.mock('better-auth/cookies', () => ({
  getSessionCookie: (request: NextRequest) =>
    request.cookies.get('better-auth.session_token')?.value ?? null,
}));

// The Next.js proxy's two jobs (DECISIONS D25, §7 H1, D46).

const SECRET = 'a-proxy-secret-that-is-long-enough-123';

/** The request headers NextResponse.next() will forward, as Next encodes them. */
function forwarded(response: Response): Record<string, string | null> {
  const get = (name: string) => response.headers.get(`x-middleware-request-${name}`);
  return {
    secret: get('x-uniconnect-proxy-secret'),
    ip: get('x-uniconnect-client-ip'),
  };
}

function apiRequest(headers: Record<string, string>) {
  return new NextRequest('http://localhost:3000/api/v1/events', { headers });
}

describe('proxy: /api forwarding (H1)', () => {
  const saved = process.env.PROXY_SHARED_SECRET;
  afterEach(() => {
    process.env.PROXY_SHARED_SECRET = saved;
  });

  it('replaces forged proxy headers with the real secret and the first forwarded hop', () => {
    process.env.PROXY_SHARED_SECRET = SECRET;
    const response = proxy(
      apiRequest({
        'x-forwarded-for': '203.0.113.7, 10.0.0.1',
        'x-uniconnect-proxy-secret': 'forged',
        'x-uniconnect-client-ip': '6.6.6.6',
      }),
    );
    expect(forwarded(response)).toEqual({ secret: SECRET, ip: '203.0.113.7' });
  });

  it('sends no client IP when the forwarded value is not an address', () => {
    process.env.PROXY_SHARED_SECRET = SECRET;
    const response = proxy(apiRequest({ 'x-forwarded-for': 'not-an-ip' }));
    expect(forwarded(response)).toEqual({ secret: SECRET, ip: null });
  });

  it('without a configured secret, strips the forged headers and adds nothing', () => {
    delete process.env.PROXY_SHARED_SECRET;
    const response = proxy(
      apiRequest({ 'x-uniconnect-proxy-secret': 'forged', 'x-uniconnect-client-ip': '6.6.6.6' }),
    );
    // The overridden header list no longer contains them.
    const overridden = response.headers.get('x-middleware-override-headers') ?? '';
    expect(overridden).not.toContain('x-uniconnect-proxy-secret');
    expect(overridden).not.toContain('x-uniconnect-client-ip');
    expect(forwarded(response)).toEqual({ secret: null, ip: null });
  });

  it('never sends signed-out /api requests to the login page', () => {
    const response = proxy(apiRequest({}));
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('proxy: dashboard gate (D25)', () => {
  it('lets a visitor with a session cookie through', () => {
    const request = new NextRequest('http://localhost:3000/dashboard', {
      headers: { cookie: 'better-auth.session_token=abc' },
    });
    expect(proxy(request).headers.get('location')).toBeNull();
  });

  it('sends a signed-out visitor to log in, keeping where they were going', () => {
    const response = proxy(new NextRequest('http://localhost:3000/dashboard/events?page=2'));
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Fdashboard%2Fevents%3Fpage%3D2',
    );
  });
});
