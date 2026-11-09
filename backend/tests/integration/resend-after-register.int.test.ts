// Regression test for the reported issue "Resend verification email right after registering
// returns 429". The registration send ran the per-email hook and used up the 1-per-5-minutes
// resend budget. Fixed in src/lib/auth.ts: per-email limits apply to HTTP requests only.
import {
  ORIGIN,
  departmentId,
  fakeRedis,
  loadHarness,
  resetDatabase,
  sentEmails,
  studentBody,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';

const h = await loadHarness();
const { app } = h;
const EMAIL = 'ayesha@example.com';
const RL_KEY = `rl:email:/send-verification-email:${EMAIL}`;
let cse: number;

beforeAll(async () => {
  cse = await departmentId(h, 'CSE');
});
beforeEach(() => resetDatabase(h));

const post = (path: string, body: object = {}) =>
  request(app).post(path).set('Origin', ORIGIN).send(body);

const resend = () =>
  post('/api/auth/send-verification-email', { email: EMAIL, callbackURL: '/login?verified=true' });

describe('repro: resend verification right after registration', () => {
  it('registration send does not consume the user-facing resend budget', async () => {
    const reg = await post('/api/v1/auth/register/student', studentBody(cse));
    expect(reg.status).toBe(201);

    const keysAfterRegister = fakeRedis.keys();
    const verifyJobsAfterRegister = sentEmails.filter((j) => j.kind === 'verify-email').length;

    // NO fakeRedis.reset() here: this is the real user flow.
    const res = await resend();

    expect(verifyJobsAfterRegister).toBe(1);
    expect(keysAfterRegister).not.toContain(RL_KEY);
    expect(res.status).toBe(200);
    expect(sentEmails.filter((j) => j.kind === 'verify-email')).toHaveLength(2);
  });

  it('control: a resend with no registration send in the window is allowed', async () => {
    const reg = await post('/api/v1/auth/register/student', studentBody(cse));
    expect(reg.status).toBe(201);
    fakeRedis.reset(); // drop whatever the registration send counted

    const res = await resend();

    expect(res.status).toBe(200);
    expect(sentEmails.filter((j) => j.kind === 'verify-email')).toHaveLength(2);
  });
});
