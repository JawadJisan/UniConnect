import {
  ORIGIN,
  PASSWORD,
  departmentId,
  fakeRedis,
  lastLink,
  loadHarness,
  resetDatabase,
  sentEmails,
  sessionCookie,
  studentBody,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import { signJWT } from 'better-auth/crypto';
import request from 'supertest';

const h = await loadHarness();
const { app, prisma, env } = h;
const EMAIL = 'ayesha@example.com';
const NEW_PASSWORD = 'N3w!passw0rd';
let cse: number;

beforeAll(async () => {
  cse = await departmentId(h, 'CSE');
});
beforeEach(() => resetDatabase(h));

const post = (path: string, body: object = {}, cookie?: string) => {
  const req = request(app).post(path).set('Origin', ORIGIN);
  if (cookie) req.set('Cookie', cookie);
  return req.send(body);
};
const get = (path: string, cookie?: string) => {
  const req = request(app).get(path).set('Origin', ORIGIN);
  if (cookie) req.set('Cookie', cookie);
  return req;
};

async function register(overrides: Record<string, unknown> = {}) {
  const res = await post('/api/v1/auth/register/student', studentBody(cse, overrides));
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

async function registerVerified() {
  const id = await register();
  const verify = await get(lastLink('verify-email', EMAIL));
  expect(verify.status).toBe(302);
  return id;
}

async function signIn(password = PASSWORD) {
  return post('/api/auth/sign-in/email', { email: EMAIL, password });
}

async function signedIn() {
  const id = await registerVerified();
  const res = await signIn();
  expect(res.status).toBe(200);
  const cookie = sessionCookie(res.headers['set-cookie']);
  expect(cookie).toBeDefined();
  return { id, cookie: cookie! };
}

const actions = async (userId: string) =>
  (await prisma.auditLog.findMany({ where: { userId }, orderBy: { id: 'asc' } })).map(
    (a) => a.action,
  );

describe('email verification', () => {
  it('verifies with the emailed link, redirects to /login?verified=true and audits it', async () => {
    const id = await register();

    const res = await get(lastLink('verify-email', EMAIL));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?verified=true');
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.emailVerified).toBe(true);
    expect(await actions(id)).toEqual([
      AUDIT_ACTIONS.USER_REGISTERED,
      AUDIT_ACTIONS.EMAIL_VERIFIED,
    ]);
  });

  it('does not sign the user in after verifying', async () => {
    await register();
    const res = await get(lastLink('verify-email', EMAIL));
    expect(sessionCookie(res.headers['set-cookie'])).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });

  it('is safe to click twice', async () => {
    await register();
    const link = lastLink('verify-email', EMAIL);
    await get(link);
    const again = await get(link);
    expect(again.status).toBe(302);
    expect(again.headers.location).toBe('/login?verified=true');
  });

  it('redirects a tampered token with error=INVALID_TOKEN and verifies nothing', async () => {
    const id = await register();
    const link = lastLink('verify-email', EMAIL);
    const url = new URL(link, ORIGIN);
    const token = url.searchParams.get('token')!;
    url.searchParams.set('token', `${token.slice(0, -4)}AAAA`);

    const res = await get(`${url.pathname}${url.search}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?verified=true&error=INVALID_TOKEN');
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).emailVerified).toBe(false);
  });

  it('redirects an expired token with error=TOKEN_EXPIRED', async () => {
    const id = await register();
    const expired = await signJWT({ email: EMAIL, userId: id }, env.BETTER_AUTH_SECRET, -60);

    const res = await get(
      `/api/auth/verify-email?token=${expired}&callbackURL=${encodeURIComponent('/login?verified=true')}`,
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?verified=true&error=TOKEN_EXPIRED');
  });
});

describe('POST /api/auth/send-verification-email (resend)', () => {
  it('queues a new link, then returns 429 inside the per-email window', async () => {
    await register();
    fakeRedis.reset(); // isolate the resend window from the registration send
    sentEmails.length = 0;

    const first = await post('/api/auth/send-verification-email', {
      email: EMAIL,
      callbackURL: '/login?verified=true',
    });
    const second = await post('/api/auth/send-verification-email', {
      email: EMAIL,
      callbackURL: '/login?verified=true',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.code).toBe('RATE_LIMITED');
    expect(sentEmails).toHaveLength(1);
  });

  it('counts the email case-insensitively', async () => {
    await register();
    fakeRedis.reset();
    await post('/api/auth/send-verification-email', { email: EMAIL });
    const res = await post('/api/auth/send-verification-email', { email: 'AYESHA@EXAMPLE.COM' });
    expect(res.status).toBe(429);
  });

  it('fails open when Redis is down', async () => {
    await register();
    fakeRedis.down = true;
    sentEmails.length = 0;

    const res = await post('/api/auth/send-verification-email', { email: EMAIL });

    expect(res.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
  });
});

describe('POST /api/auth/sign-in/email', () => {
  it('signs in a verified user with an httpOnly, SameSite=Lax cookie and audits LOGIN', async () => {
    const id = await registerVerified();

    const res = await signIn();

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id, email: EMAIL, role: 'student' });
    expect(JSON.stringify(res.body.user)).not.toMatch(/password/i);
    const raw = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.includes('session_token='),
    )!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Path=\//);
    expect(await actions(id)).toContain(AUDIT_ACTIONS.LOGIN);
  });

  it('returns 401 for a wrong password and creates no session', async () => {
    await registerVerified();
    const res = await signIn('Wr0ng!pass');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect(await prisma.session.count()).toBe(0);
  });

  it('returns 401 for an unknown email with the same code', async () => {
    const res = await post('/api/auth/sign-in/email', {
      email: 'nobody@example.com',
      password: PASSWORD,
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  it('returns 403 EMAIL_NOT_VERIFIED before verification', async () => {
    await register();
    const res = await signIn();
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await prisma.session.count()).toBe(0);
  });

  it('returns 403 ACCOUNT_SUSPENDED for a suspended user and creates no session', async () => {
    const id = await registerVerified();
    await prisma.user.update({ where: { id }, data: { isActive: false } });

    const res = await signIn();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
    expect(await prisma.session.count()).toBe(0);
    expect(await actions(id)).not.toContain(AUDIT_ACTIONS.LOGIN);
  });

  it('ignores the public sign-up route', async () => {
    const res = await post('/api/auth/sign-up/email', {
      email: 'new@example.com',
      password: PASSWORD,
      name: 'New',
    });
    expect(res.status).toBe(404);
    expect(await prisma.user.count()).toBe(0);
  });
});

describe('session and sign-out', () => {
  it('returns the session for the cookie, and null after sign-out', async () => {
    const { id, cookie } = await signedIn();

    const before = await get('/api/auth/get-session', cookie);
    expect(before.status).toBe(200);
    expect(before.body.user).toMatchObject({ id, email: EMAIL });
    expect(JSON.stringify(before.body)).not.toMatch(/"password"/);

    const out = await post('/api/auth/sign-out', {}, cookie);
    expect(out.status).toBe(200);

    const after = await get('/api/auth/get-session', cookie);
    expect(after.body).toBeNull();
    expect(await prisma.session.count()).toBe(0);
  });

  it('returns null without a cookie', async () => {
    const res = await get('/api/auth/get-session');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('rejects /update-user even with a session (role cannot be self-assigned)', async () => {
    const { id, cookie } = await signedIn();
    const res = await post('/api/auth/update-user', { role: 'super_admin' }, cookie);
    expect(res.status).toBe(404);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).role).toBe('student');
  });
});

describe('password reset', () => {
  async function requestReset(email = EMAIL) {
    return post('/api/auth/request-password-reset', { email, redirectTo: '/reset-password' });
  }

  async function resetToken() {
    const res = await get(lastLink('reset-password', EMAIL));
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location as string, ORIGIN);
    expect(location.pathname).toBe('/reset-password');
    return location.searchParams.get('token')!;
  }

  it('answers the same for a known and an unknown email', async () => {
    await registerVerified();

    const known = await requestReset();
    const unknown = await requestReset('nobody@example.com');

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(sentEmails.filter((e) => e.kind === 'reset-password')).toHaveLength(1);
  });

  it('resets with the emailed token, revokes sessions, audits, and works once', async () => {
    const { id, cookie } = await signedIn();
    await requestReset();
    const token = await resetToken();

    const res = await post('/api/auth/reset-password', { newPassword: NEW_PASSWORD, token });

    expect(res.status).toBe(200);
    expect((await get('/api/auth/get-session', cookie)).body).toBeNull();
    expect(await actions(id)).toContain(AUDIT_ACTIONS.PASSWORD_CHANGED);
    expect((await signIn()).status).toBe(401);
    expect((await signIn(NEW_PASSWORD)).status).toBe(200);

    const reuse = await post('/api/auth/reset-password', { newPassword: 'An0ther!pass', token });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe('INVALID_TOKEN');
  });

  it('rejects a weak new password with PASSWORD_TOO_WEAK', async () => {
    await registerVerified();
    await requestReset();
    const token = await resetToken();

    const res = await post('/api/auth/reset-password', { newPassword: 'alllowercase', token });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_TOO_WEAK');
    expect((await signIn()).status).toBe(200);
  });

  it('redirects a bad reset link to the callback with error=INVALID_TOKEN', async () => {
    const res = await get('/api/auth/reset-password/not-a-token?callbackURL=%2Freset-password');
    expect(res.status).toBe(302);
    // Better Auth resolves the callback against BETTER_AUTH_URL, the frontend origin.
    expect(res.headers.location).toBe(`${ORIGIN}/reset-password?error=INVALID_TOKEN`);
  });

  it('limits reset requests to 3 per email per hour', async () => {
    await registerVerified();
    const statuses = [];
    for (let i = 0; i < 4; i += 1) statuses.push((await requestReset()).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe('POST /api/auth/change-password', () => {
  it('returns 401 without a session', async () => {
    const res = await post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(401);
  });

  it('applies the password policy', async () => {
    const { cookie } = await signedIn();
    const res = await post(
      '/api/auth/change-password',
      { currentPassword: PASSWORD, newPassword: 'short' },
      cookie,
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_TOO_WEAK');
  });

  it('rejects a wrong current password', async () => {
    const { cookie } = await signedIn();
    const res = await post(
      '/api/auth/change-password',
      { currentPassword: 'Wr0ng!pass', newPassword: NEW_PASSWORD },
      cookie,
    );
    expect(res.status).toBe(400);
    expect((await signIn()).status).toBe(200);
  });

  it('changes the password and audits PASSWORD_CHANGED', async () => {
    const { id, cookie } = await signedIn();

    const res = await post(
      '/api/auth/change-password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      cookie,
    );

    expect(res.status).toBe(200);
    const changed = await prisma.auditLog.findMany({
      where: { userId: id, action: AUDIT_ACTIONS.PASSWORD_CHANGED },
    });
    expect(changed).toHaveLength(1);
    expect(changed[0]!.newValue).toEqual({ via: 'change' });
    expect((await signIn(NEW_PASSWORD)).status).toBe(200);
  });
});
