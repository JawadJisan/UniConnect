import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

// The registration flow with Prisma and Better Auth mocked, so no database or Redis is needed.
type Fn = (arg?: unknown) => Promise<unknown>;

const departmentCount = jest.fn<Fn>();
const userCount = jest.fn<Fn>();
const txUserCreate = jest.fn<Fn>();
const txAccountCreate = jest.fn<Fn>();
const txAuditCreate = jest.fn<Fn>();
const hash = jest.fn<(pw: string) => Promise<string>>();
const sendVerificationEmail = jest.fn<Fn>();

const tx = {
  user: { create: txUserCreate },
  account: { create: txAccountCreate },
  auditLog: { create: txAuditCreate },
};

jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: {
    department: { count: departmentCount },
    user: { count: userCount },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));
jest.unstable_mockModule('../src/lib/redis.js', () => ({ redis: {}, createRedis: jest.fn() }));
jest.unstable_mockModule('../src/lib/auth.js', () => ({
  auth: {
    $context: Promise.resolve({ password: { hash } }),
    api: { sendVerificationEmail },
    handler: async () => new Response(null, { status: 404 }),
  },
}));

const { app } = await import('../src/app.js');

const student = {
  name: 'Ayesha Rahman',
  email: 'Ayesha@Example.com',
  password: 'Str0ng!pass',
  department_id: 1,
  blood_group: 'B+',
  academic_session: '2022-2023',
  current_year: 3,
  current_semester: 1,
  student_id: 'CSE-2022/014',
};
const { academic_session, current_year, current_semester, student_id, ...faculty } = student;
void [academic_session, current_year, current_semester, student_id];

const USER_ID = '3f2b8c1e-5a7d-4e0a-9d6b-1c2d3e4f5a6b';

beforeEach(() => {
  departmentCount.mockReset().mockResolvedValue(1);
  userCount.mockReset().mockResolvedValue(0);
  hash.mockReset().mockResolvedValue('scrypt-hash');
  txUserCreate.mockReset().mockImplementation(async (args: unknown) => {
    const { data } = args as { data: { email: string; name: string; role: string } };
    return { id: USER_ID, email: data.email, name: data.name, role: data.role };
  });
  txAccountCreate.mockReset().mockResolvedValue({ id: 'acc' });
  txAuditCreate.mockReset().mockResolvedValue({ id: 1 });
  sendVerificationEmail.mockReset().mockResolvedValue({ status: true });
});

describe('POST /api/v1/auth/register/student', () => {
  it('creates the user, account and audit row in one transaction, then sends the email', async () => {
    const res = await request(app).post('/api/v1/auth/register/student').send(student);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      message: 'Registration successful. Please verify your email.',
      data: { id: USER_ID, email: 'ayesha@example.com', role: 'student' },
    });

    const { data } = txUserCreate.mock.calls[0]?.[0] as unknown as {
      data: Record<string, unknown>;
    };
    expect(data).toMatchObject({
      email: 'ayesha@example.com',
      userType: 'student',
      role: 'student',
      isActive: true,
      emailVerified: false,
      studentId: 'CSE-2022/014',
    });
    expect(data).not.toHaveProperty('password');

    expect(hash).toHaveBeenCalledWith('Str0ng!pass');
    expect(txAccountCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: USER_ID,
          accountId: USER_ID,
          providerId: 'credential',
          password: 'scrypt-hash',
        },
      }),
    );
    // The audit row went through the transaction client.
    expect(txAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'USER_REGISTERED', userId: USER_ID }),
      }),
    );
    expect(sendVerificationEmail).toHaveBeenCalledWith({
      body: { email: 'ayesha@example.com', callbackURL: '/login?verified=true' },
    });
  });

  it('still returns 201 when the verification email cannot be queued', async () => {
    sendVerificationEmail.mockRejectedValue(new Error('redis down'));

    const res = await request(app).post('/api/v1/auth/register/student').send(student);

    expect(res.status).toBe(201);
  });

  it('rejects a client-chosen role with 400 and creates nothing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register/student')
      .send({ ...student, role: 'super_admin' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(txUserCreate).not.toHaveBeenCalled();
  });

  it('returns the password policy message for a weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register/student')
      .send({ ...student, password: 'weakpass' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Password does not meet requirements.');
  });

  it('returns 400 for an unknown department', async () => {
    departmentCount.mockResolvedValue(0);

    const res = await request(app).post('/api/v1/auth/register/student').send(student);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'DEPARTMENT_NOT_FOUND',
      message: 'Department not found.',
    });
  });

  it('returns 409 for a duplicate email', async () => {
    userCount.mockResolvedValueOnce(1);

    const res = await request(app).post('/api/v1/auth/register/student').send(student);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Email already registered.');
  });

  it('returns 409 for a duplicate student ID in the department', async () => {
    userCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

    const res = await request(app).post('/api/v1/auth/register/student').send(student);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Student ID already registered.');
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register/student')
      .set('Content-Type', 'application/json')
      .send('{"name":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('POST /api/v1/auth/register/faculty', () => {
  it('creates a faculty user with no academic fields', async () => {
    const res = await request(app).post('/api/v1/auth/register/faculty').send(faculty);

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('faculty');
    const { data } = txUserCreate.mock.calls[0]?.[0] as unknown as {
      data: Record<string, unknown>;
    };
    expect(data).toMatchObject({ userType: 'faculty', role: 'faculty' });
    expect(data).not.toHaveProperty('studentId');
  });

  it('rejects student-only fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register/faculty')
      .send({ ...faculty, student_id: 'X1' });

    expect(res.status).toBe(400);
  });
});
