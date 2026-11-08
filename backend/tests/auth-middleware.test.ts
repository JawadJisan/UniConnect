import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Every row of the PRD FR-AUTH-008 middleware table, with Better Auth's getSession mocked.
type SessionResult = { headers: Headers; response: unknown };
const getSession = jest.fn<(args: unknown) => Promise<SessionResult>>();

jest.unstable_mockModule('../src/lib/auth.js', () => ({ auth: { api: { getSession } } }));

const { requireAuth, requireRole, requireDepartmentScope, departmentFromParam } =
  await import('../src/middleware/auth.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');

const app = express();
app.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.auth?.user.id });
});
app.get('/admin', requireAuth, requireRole(['super_admin']), (_req, res) => {
  res.json({ ok: true });
});
app.get(
  '/departments/:departmentId',
  requireAuth,
  requireRole(['dept_admin', 'super_admin']),
  requireDepartmentScope(departmentFromParam('departmentId')),
  (_req, res) => {
    res.json({ ok: true });
  },
);
app.get(
  '/hidden/:departmentId',
  requireAuth,
  requireDepartmentScope(departmentFromParam('departmentId'), { hide: true }),
  (_req, res) => {
    res.json({ ok: true });
  },
);
// Misconfigured on purpose: no requireAuth in front.
app.get('/broken', requireRole(['student']), (_req, res) => {
  res.json({ ok: true });
});
app.use(errorHandler);

function signedIn(user: Record<string, unknown>, setCookie?: string) {
  const headers = new Headers();
  if (setCookie) headers.append('set-cookie', setCookie);
  getSession.mockResolvedValue({
    headers,
    response: {
      session: { id: 's1', userId: 'u1' },
      user: { id: 'u1', role: 'student', departmentId: 1, isActive: true, ...user },
    },
  });
}

beforeEach(() => {
  getSession.mockReset().mockResolvedValue({ headers: new Headers(), response: null });
});

describe('requireAuth', () => {
  it('returns 401 with no session (missing, expired, revoked or tampered cookie)', async () => {
    const res = await request(app).get('/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 403 for a suspended account', async () => {
    signedIn({ isActive: false });

    const res = await request(app).get('/me');

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Account is suspended. Contact admin.');
  });

  it('passes the cookie headers to Better Auth and attaches the session', async () => {
    signedIn({});

    const res = await request(app).get('/me').set('Cookie', 'better-auth.session_token=abc');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'u1' });
    const { headers } = getSession.mock.calls[0]?.[0] as { headers: Headers };
    expect(headers.get('cookie')).toBe('better-auth.session_token=abc');
  });

  it('forwards a refreshed session cookie (sliding window)', async () => {
    signedIn({}, 'better-auth.session_token=new; Path=/; HttpOnly; SameSite=Lax');

    const res = await request(app).get('/me');

    expect(res.headers['set-cookie']?.[0]).toContain('better-auth.session_token=new');
  });
});

describe('requireRole', () => {
  it('returns 403 for the wrong role', async () => {
    signedIn({ role: 'dept_admin' });

    expect((await request(app).get('/admin')).status).toBe(403);
  });

  it('allows a listed role', async () => {
    signedIn({ role: 'super_admin', departmentId: null });

    expect((await request(app).get('/admin')).status).toBe(200);
  });

  it('fails closed with 500 when requireAuth is missing', async () => {
    expect((await request(app).get('/broken')).status).toBe(500);
  });
});

describe('requireDepartmentScope', () => {
  it('allows the caller’s own department', async () => {
    signedIn({ role: 'dept_admin', departmentId: 1 });

    expect((await request(app).get('/departments/1')).status).toBe(200);
  });

  it('returns 403 for another department', async () => {
    signedIn({ role: 'dept_admin', departmentId: 1 });

    expect((await request(app).get('/departments/2')).status).toBe(403);
  });

  it('returns 404 for another department when existence is hidden', async () => {
    signedIn({ departmentId: 1 });

    expect((await request(app).get('/hidden/2')).status).toBe(404);
  });

  it('lets super_admin through to any department', async () => {
    signedIn({ role: 'super_admin', departmentId: null });

    expect((await request(app).get('/departments/2')).status).toBe(200);
  });

  it('returns 404 when the target cannot be resolved', async () => {
    signedIn({ role: 'dept_admin', departmentId: 1 });

    expect((await request(app).get('/departments/abc')).status).toBe(404);
  });
});
