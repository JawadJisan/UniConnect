import {
  ORIGIN,
  PASSWORD,
  departmentId,
  facultyBody,
  lastLink,
  loadHarness,
  resetDatabase,
  sessionCookie,
  studentBody,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

// Real Express, Better Auth, Prisma and Postgres; Cloudinary is mocked at its client module.
// The audit repository is wrapped so one test can make the audit write fail mid-transaction;
// otherwise it does exactly what src/repositories/audit.repository.ts does.
const auditFailure = { on: false };
const uploadAvatar = jest.fn<(userId: string, buffer: Buffer) => Promise<string>>();

jest.unstable_mockModule('../../src/lib/cloudinary.js', () => ({
  uploadAvatar,
  uploadClubLogo: jest.fn(),
}));
jest.unstable_mockModule('../../src/repositories/audit.repository.js', () => ({
  auditRepository: {
    create(db: { auditLog: { create: (a: unknown) => Promise<unknown> } }, data: unknown) {
      if (auditFailure.on) return Promise.reject(new Error('audit write failed'));
      return db.auditLog.create({ data, select: { id: true } });
    },
  },
}));

const h = await loadHarness();
const { app, prisma } = h;
let cse: number;
let ece: number;

beforeAll(async () => {
  cse = await departmentId(h, 'CSE');
  ece = await departmentId(h, 'ECE');
});
beforeEach(async () => {
  await resetDatabase(h);
  auditFailure.on = false;
  uploadAvatar.mockReset();
});

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

/** Registers, verifies and signs in. Returns the user id and session cookie. */
async function signedIn(kind: 'student' | 'faculty', overrides: Record<string, unknown> = {}) {
  const body = kind === 'student' ? studentBody(cse, overrides) : facultyBody(cse, overrides);
  const reg = await request(app)
    .post(`/api/v1/auth/register/${kind}`)
    .set('Origin', ORIGIN)
    .send(body);
  expect(reg.status).toBe(201);
  const verify = await request(app).get(lastLink('verify-email', body.email)).set('Origin', ORIGIN);
  expect(verify.status).toBe(302);
  const signIn = await request(app)
    .post('/api/auth/sign-in/email')
    .set('Origin', ORIGIN)
    .send({ email: body.email, password: PASSWORD });
  expect(signIn.status).toBe(200);
  return { id: reg.body.data.id as string, cookie: sessionCookie(signIn.headers['set-cookie'])! };
}

const getMe = (cookie: string) =>
  request(app).get('/api/v1/users/me').set('Origin', ORIGIN).set('Cookie', cookie);
const patchMe = (cookie: string, body: object) =>
  request(app).patch('/api/v1/users/me').set('Origin', ORIGIN).set('Cookie', cookie).send(body);

const auditsOf = (userId: string, action: string) =>
  prisma.auditLog.findMany({ where: { userId, action } });

describe('GET /api/v1/users/me', () => {
  it('returns the real row, with no password hash or token anywhere', async () => {
    const { id, cookie } = await signedIn('student');

    const res = await getMe(cookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id,
      email: 'ayesha@example.com',
      user_type: 'student',
      role: 'student',
      email_verified: true,
      department: { id: cse, name: 'CSE' },
      student_id: 'CSE-2022/014',
    });
    const account = await prisma.account.findFirstOrThrow({ where: { userId: id } });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(account.password!);
    expect(text).not.toMatch(/password|token/i);
  });

  it('401 without a cookie', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('403 once the account is suspended', async () => {
    const { id, cookie } = await signedIn('student');
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    expect((await getMe(cookie)).status).toBe(403);
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('updates a student and writes PROFILE_UPDATED with the changed fields only', async () => {
    const { id, cookie } = await signedIn('student');

    const res = await patchMe(cookie, { current_year: 4, phone: '+8801712345678' });

    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user).toMatchObject({ currentYear: 4, phone: '+8801712345678' });
    // Server-owned fields are untouched.
    expect(user).toMatchObject({
      role: 'student',
      userType: 'student',
      departmentId: cse,
      emailVerified: true,
      isActive: true,
    });
    const [audit, ...rest] = await auditsOf(id, AUDIT_ACTIONS.PROFILE_UPDATED);
    expect(rest).toHaveLength(0);
    expect(audit?.oldValue).toEqual({ current_year: 3, phone: null });
    expect(audit?.newValue).toEqual({ current_year: 4, phone: '+8801712345678' });
  });

  it('rejects department_id and leaves the row unchanged', async () => {
    const { id, cookie } = await signedIn('student');

    const res = await patchMe(cookie, { department_id: ece });

    expect(res.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).departmentId).toBe(cse);
  });

  it('rejects academic fields from faculty', async () => {
    const { id, cookie } = await signedIn('faculty');

    const res = await patchMe(cookie, { student_id: 'F-1' });

    expect(res.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).studentId).toBeNull();
  });

  it('lets faculty change their blood group', async () => {
    const { id, cookie } = await signedIn('faculty');
    const res = await patchMe(cookie, { blood_group: 'AB-' });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).bloodGroup).toBe('AB-');
  });

  it('409 for a student ID already used in the same department', async () => {
    await signedIn('student', { email: 'first@example.com', student_id: 'CSE-1' });
    const { id, cookie } = await signedIn('student', {
      email: 'second@example.com',
      student_id: 'CSE-2',
    });

    const res = await patchMe(cookie, { student_id: 'CSE-1' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STUDENT_ID_TAKEN');
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).studentId).toBe('CSE-2');
    expect(await auditsOf(id, AUDIT_ACTIONS.PROFILE_UPDATED)).toHaveLength(0);
  });

  it('allows the same student ID in another department', async () => {
    await signedIn('student', { email: 'first@example.com', student_id: 'SHARED-1' });
    const reg = studentBody(ece, { email: 'ece@example.com', student_id: 'ECE-9' });
    await request(app).post('/api/v1/auth/register/student').set('Origin', ORIGIN).send(reg);
    await request(app).get(lastLink('verify-email', reg.email)).set('Origin', ORIGIN);
    const signIn = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: reg.email, password: PASSWORD });
    const cookie = sessionCookie(signIn.headers['set-cookie'])!;

    const res = await patchMe(cookie, { student_id: 'SHARED-1' });

    expect(res.status).toBe(200);
  });

  it('a parallel race for one student ID gives one 200 and one 409', async () => {
    const a = await signedIn('student', { email: 'a@example.com', student_id: 'CSE-A' });
    const b = await signedIn('student', { email: 'b@example.com', student_id: 'CSE-B' });

    const results = await Promise.all([
      patchMe(a.cookie, { student_id: 'CSE-RACE' }),
      patchMe(b.cookie, { student_id: 'CSE-RACE' }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe('STUDENT_ID_TAKEN');
    expect(await prisma.user.count({ where: { departmentId: cse, studentId: 'CSE-RACE' } })).toBe(
      1,
    );
  });

  it('rolls the update back when the audit write fails', async () => {
    const { id, cookie } = await signedIn('student');
    auditFailure.on = true;

    const res = await patchMe(cookie, { name: 'Rolled Back' });

    expect(res.status).toBe(500);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).name).toBe('Ayesha Rahman');
  });

  it('keeps working on the session that changed the password', async () => {
    const { cookie } = await signedIn('student');
    const change = await request(app)
      .post('/api/auth/change-password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ currentPassword: PASSWORD, newPassword: 'N3w!passw0rd' });
    expect(change.status).toBe(200);
    // Better Auth may rotate the session; use the new cookie when it sends one.
    const next = sessionCookie(change.headers['set-cookie']) ?? cookie;

    expect((await getMe(next)).status).toBe(200);
  });
});

describe('PATCH /api/v1/users/me/avatar', () => {
  const upload = (cookie: string) =>
    request(app)
      .patch('/api/v1/users/me/avatar')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .attach('avatar', JPEG, { filename: 'me.jpg', contentType: 'image/jpeg' });

  it('saves the uploaded URL and audits AVATAR_UPDATED', async () => {
    const { id, cookie } = await signedIn('student');
    const url = 'https://res.cloudinary.com/demo/image/upload/v2/uniconnect/avatars/x.jpg';
    uploadAvatar.mockResolvedValue(url);

    const res = await upload(cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.avatar_url).toBe(url);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).image).toBe(url);
    expect(uploadAvatar).toHaveBeenCalledWith(id, JPEG);
    const [audit] = await auditsOf(id, AUDIT_ACTIONS.AVATAR_UPDATED);
    expect(audit?.newValue).toEqual({ avatar_url: url });
  });

  it('keeps the old avatar when the upload fails', async () => {
    const { id, cookie } = await signedIn('student');
    const { AppError } = await import('../../src/lib/http-error.js');
    uploadAvatar.mockRejectedValue(new AppError(502, 'UPLOAD_FAILED', 'Upload failed.'));

    const res = await upload(cookie);

    expect(res.status).toBe(502);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).image).toBeNull();
    expect(await auditsOf(id, AUDIT_ACTIONS.AVATAR_UPDATED)).toHaveLength(0);
  });
});
