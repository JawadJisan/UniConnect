// Regression tests for the security review findings fixed on feat/auth-pages (2026-11-08).
// IDs refer to the review recorded in docs/DECISIONS.md §4.
import {
  ORIGIN,
  PASSWORD,
  departmentId,
  emailQueue,
  fakeRedis,
  lastLink,
  loadHarness,
  resetDatabase,
  sentEmails,
  sessionCookie,
  studentBody,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';

const h = await loadHarness();
const { app, prisma } = h;
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

async function registerVerified() {
  const res = await post('/api/v1/auth/register/student', studentBody(cse));
  expect(res.status).toBe(201);
  expect((await get(lastLink('verify-email', EMAIL))).status).toBe(302);
  return res.body.data.id as string;
}

async function signIn(password = PASSWORD) {
  const res = await post('/api/auth/sign-in/email', { email: EMAIL, password });
  expect(res.status).toBe(200);
  return sessionCookie(res.headers['set-cookie'])!;
}

describe('M2: a suspended user cannot use an existing session on Better Auth routes', () => {
  it('rejects get-session and change-password once the user is suspended', async () => {
    const id = await registerVerified();
    const cookie = await signIn();
    await prisma.user.update({ where: { id }, data: { isActive: false } });

    const session = await get('/api/auth/get-session', cookie);
    expect(session.status).toBe(403);
    expect(session.body.code).toBe('ACCOUNT_SUSPENDED');

    const change = await post(
      '/api/auth/change-password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      cookie,
    );
    expect(change.status).toBe(403);
  });

  it('still lets a suspended user sign out', async () => {
    const id = await registerVerified();
    const cookie = await signIn();
    await prisma.user.update({ where: { id }, data: { isActive: false } });

    expect((await post('/api/auth/sign-out', {}, cookie)).status).toBe(200);
    expect(await prisma.session.count()).toBe(0);
  });

  it('leaves an active user untouched', async () => {
    await registerVerified();
    const cookie = await signIn();
    expect((await get('/api/auth/get-session', cookie)).body.user.email).toBe(EMAIL);
  });
});

describe('M4: request-password-reset answers the same when the email queue is down', () => {
  it('returns the same 200 for a known and an unknown email', async () => {
    await registerVerified();
    emailQueue.down = true;

    const known = await post('/api/auth/request-password-reset', {
      email: EMAIL,
      redirectTo: '/reset-password',
    });
    const unknown = await post('/api/auth/request-password-reset', {
      email: 'nobody@example.com',
      redirectTo: '/reset-password',
    });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it('answers a resend for an unverified account with 200 when the queue is down', async () => {
    expect((await post('/api/v1/auth/register/student', studentBody(cse))).status).toBe(201);
    emailQueue.down = true;
    sentEmails.length = 0;

    const res = await post('/api/auth/send-verification-email', { email: EMAIL });
    expect(res.status).toBe(200);
  });
});

describe('L1: /verify-password is not reachable over HTTP', () => {
  it('returns 404 even with a session', async () => {
    await registerVerified();
    const cookie = await signIn();
    const res = await post('/api/auth/verify-password', { password: PASSWORD }, cookie);
    expect(res.status).toBe(404);
  });
});

describe('L7: changing the password signs out every other session', () => {
  it('revokes other sessions even when the client asks to keep them', async () => {
    await registerVerified();
    const laptop = await signIn();
    const phone = await signIn();

    const res = await post(
      '/api/auth/change-password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, revokeOtherSessions: false },
      laptop,
    );

    expect(res.status).toBe(200);
    expect((await get('/api/auth/get-session', phone)).body).toBeNull();
  });
});

// Phase 10 hardening (DECISIONS §7, D46), through the real app and auth stack.

describe('I1: the session token stays in the cookie', () => {
  it('leaves it out of the sign-in and get-session bodies, and the cookie still works', async () => {
    await registerVerified();
    const signInRes = await post('/api/auth/sign-in/email', { email: EMAIL, password: PASSWORD });
    expect(signInRes.status).toBe(200);
    expect(signInRes.body).not.toHaveProperty('token');
    const cookie = sessionCookie(signInRes.headers['set-cookie'])!;

    const session = await get('/api/auth/get-session', cookie);
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe(EMAIL);
    expect(session.body.session).not.toHaveProperty('token');
    expect((await get('/api/v1/users/me', cookie)).status).toBe(200);
  });
});

describe('I2: no session outlives 30 days from sign-in', () => {
  it('ends an old session on Better Auth routes and on /api/v1', async () => {
    const id = await registerVerified();
    const cookie = await signIn();
    const day = 24 * 60 * 60 * 1000;
    // Sliding kept it alive; only its age is past the limit.
    await prisma.session.updateMany({
      where: { userId: id },
      data: { createdAt: new Date(Date.now() - 31 * day), expiresAt: new Date(Date.now() + day) },
    });

    const v1 = await get('/api/v1/users/me', cookie);
    expect(v1.status).toBe(401);
    expect(await prisma.session.count({ where: { userId: id } })).toBe(0);

    const again = await signIn();
    await prisma.session.updateMany({
      where: { userId: id },
      data: { createdAt: new Date(Date.now() - 31 * day) },
    });
    const ba = await get('/api/auth/get-session', again);
    expect(ba.status).toBe(401);
    expect(ba.body.code).toBe('SESSION_EXPIRED');
    expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
  });

  it('keeps a session signed in 29 days ago', async () => {
    const id = await registerVerified();
    const cookie = await signIn();
    await prisma.session.updateMany({
      where: { userId: id },
      data: { createdAt: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000) },
    });
    expect((await get('/api/v1/users/me', cookie)).status).toBe(200);
  });
});

describe('H1: a forged X-Forwarded-For never reaches the session row', () => {
  it('records the socket address, not the header', async () => {
    const id = await registerVerified();
    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', '6.6.6.6')
      .send({ email: EMAIL, password: PASSWORD });
    expect(res.status).toBe(200);
    const session = await prisma.session.findFirstOrThrow({ where: { userId: id } });
    expect(session.ipAddress).not.toBe('6.6.6.6');
    expect(session.ipAddress).toMatch(/127\.0\.0\.1|::1/);
  });
});

describe('L4 and I4 on the real app', () => {
  it('refuses an oversized Better Auth body with 413', async () => {
    const res = await post('/api/auth/sign-in/email', {
      email: EMAIL,
      password: 'x'.repeat(70 * 1024),
    });
    expect(res.status).toBe(413);
  });

  it('refuses a cross-site mutation on /api/v1 even with a valid session', async () => {
    await registerVerified();
    const cookie = await signIn();
    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Origin', 'https://evil.example')
      .set('Cookie', cookie)
      .send({ phone: '01711111111' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CROSS_SITE_REQUEST');
  });
});

describe('M4: request-password-reset timing for a known and an unknown email', () => {
  // Every answer is padded to RESET_FLOOR_MS (2 s), so 20 samples take about 40 s.
  it('answers both in about the same time', async () => {
    await registerVerified();
    const time = async (email: string) => {
      const started = performance.now();
      const res = await post('/api/auth/request-password-reset', {
        email,
        redirectTo: '/reset-password',
      });
      expect(res.status).toBe(200);
      return performance.now() - started;
    };
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const known: number[] = [];
    const unknown: number[] = [];
    // Interleaved, so drift in Neon latency hits both sides alike. Each email gets its own
    // per-email budget, so use a fresh unknown address every time and reset the known one.
    for (let i = 0; i < 10; i += 1) {
      fakeRedis.reset();
      known.push(await time(EMAIL));
      unknown.push(await time(`nobody${i}@example.com`));
    }
    const gap = median(known) - median(unknown);
    console.log(
      `[M4] median known ${median(known).toFixed(0)} ms, unknown ${median(unknown).toFixed(0)} ms, gap ${gap.toFixed(0)} ms`,
    );
    expect(Math.abs(gap)).toBeLessThan(50);
  }, 90_000);
});
