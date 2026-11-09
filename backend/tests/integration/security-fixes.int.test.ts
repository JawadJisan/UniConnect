// Regression tests for the security review findings fixed on feat/auth-pages (2026-11-08).
// IDs refer to the review recorded in docs/DECISIONS.md §4.
import {
  ORIGIN,
  PASSWORD,
  departmentId,
  emailQueue,
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
