import {
  ORIGIN,
  departmentId,
  facultyBody,
  loadHarness,
  resetDatabase,
  sentEmails,
  studentBody,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

const h = await loadHarness();
const { app, prisma } = h;
let cse: number;
let ece: number;

beforeAll(async () => {
  cse = await departmentId(h, 'CSE');
  ece = await departmentId(h, 'ECE');
});
beforeEach(() => resetDatabase(h));

const post = (path: string, body: unknown) =>
  request(app)
    .post(path)
    .set('Origin', ORIGIN)
    .send(body as object);

describe('POST /api/v1/auth/register/student (real database)', () => {
  it('writes the user, the credential account and the audit row, then queues the email', async () => {
    const res = await post('/api/v1/auth/register/student', studentBody(cse));

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      email: 'ayesha@example.com',
      role: 'student',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|token/i);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(user).toMatchObject({
      userType: 'student',
      role: 'student',
      isActive: true,
      emailVerified: false,
      departmentId: cse,
      studentId: 'CSE-2022/014',
    });
    const accounts = await prisma.account.findMany({ where: { userId: user.id } });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ providerId: 'credential', accountId: user.id });
    expect(accounts[0]!.password).not.toBe(studentBody(cse).password);

    const audit = await prisma.auditLog.findMany({ where: { userId: user.id } });
    expect(audit.map((a) => a.action)).toEqual([AUDIT_ACTIONS.USER_REGISTERED]);

    expect(sentEmails).toEqual([
      expect.objectContaining({ kind: 'verify-email', to: 'ayesha@example.com' }),
    ]);
  });

  it('rejects server-owned keys (mass assignment) with 400 and writes nothing', async () => {
    for (const extra of [{ role: 'super_admin' }, { is_active: false }, { user_type: 'faculty' }]) {
      const res = await post('/api/v1/auth/register/student', studentBody(cse, extra));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it('returns 400 for an unknown department', async () => {
    const res = await post('/api/v1/auth/register/student', studentBody(999_999));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'DEPARTMENT_NOT_FOUND' });
  });

  it('returns 409 for an email that differs only in case', async () => {
    expect((await post('/api/v1/auth/register/student', studentBody(cse))).status).toBe(201);

    const res = await post(
      '/api/v1/auth/register/student',
      studentBody(cse, { email: 'AYESHA@Example.COM', student_id: 'CSE-2022/099' }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('returns 409 for a student ID already used in the same department', async () => {
    await post('/api/v1/auth/register/student', studentBody(cse));

    const res = await post(
      '/api/v1/auth/register/student',
      studentBody(cse, { email: 'other@example.com' }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'STUDENT_ID_TAKEN' });
  });

  it('allows the same student ID in another department', async () => {
    await post('/api/v1/auth/register/student', studentBody(cse));

    const res = await post(
      '/api/v1/auth/register/student',
      studentBody(ece, { email: 'other@example.com' }),
    );
    expect(res.status).toBe(201);
  });

  it('lets exactly one of two parallel registrations for one email succeed', async () => {
    const [a, b] = await Promise.all([
      post('/api/v1/auth/register/student', studentBody(cse, { student_id: 'A-1' })),
      post('/api/v1/auth/register/student', studentBody(cse, { student_id: 'A-2' })),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.user.count({ where: { email: 'ayesha@example.com' } })).toBe(1);
    expect(await prisma.account.count()).toBe(1);
    expect(await prisma.auditLog.count()).toBe(1);
  });
});

describe('POST /api/v1/auth/register/faculty (real database)', () => {
  it('creates a faculty user with no academic fields', async () => {
    const res = await post('/api/v1/auth/register/faculty', facultyBody(cse));

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('faculty');
    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(user).toMatchObject({
      userType: 'faculty',
      studentId: null,
      academicSession: null,
      currentYear: null,
      currentSemester: null,
    });
  });

  it('rejects student-only and server-owned keys with 400', async () => {
    for (const extra of [{ student_id: 'X-1' }, { role: 'dept_admin' }]) {
      const res = await post('/api/v1/auth/register/faculty', facultyBody(cse, extra));
      expect(res.status).toBe(400);
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it('returns 400 with the policy message for a weak password', async () => {
    const res = await post(
      '/api/v1/auth/register/faculty',
      facultyBody(cse, { password: 'weakpass' }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Password does not meet requirements.');
  });

  it('returns 409 when the email belongs to a student', async () => {
    await post('/api/v1/auth/register/student', studentBody(cse));
    const res = await post(
      '/api/v1/auth/register/faculty',
      facultyBody(cse, { email: 'ayesha@example.com' }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});

describe('GET /api/v1/departments (real database)', () => {
  it('lists the seeded departments without a session', async () => {
    await departmentId(h, 'BBA');
    const res = await request(app).get('/api/v1/departments');

    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { name: string }) => d.name)).toEqual(
      expect.arrayContaining(['BBA', 'CSE', 'ECE']),
    );
    for (const d of res.body.data) {
      expect(Object.keys(d).sort()).toEqual(['description', 'id', 'name']);
    }
  });
});
