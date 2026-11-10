import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

// Unit tests for /api/v1/users/me with Better Auth's session, Prisma and Cloudinary mocked.
// Constraint and transaction behaviour runs against the real database in
// tests/integration/users.int.test.ts.

type SessionResult = { headers: Headers; response: unknown };
type Fn = (arg?: unknown) => Promise<unknown>;

const getSession = jest.fn<(args: unknown) => Promise<SessionResult>>();
const findUnique = jest.fn<Fn>();
const update = jest.fn<Fn>();
const count = jest.fn<Fn>();
const auditCreate = jest.fn<Fn>();
const sessionCount = jest.fn<Fn>();
const uploadAvatar = jest.fn<(userId: string, buffer: Buffer) => Promise<string>>();

const tx = {
  user: { findUnique, update, count },
  auditLog: { create: auditCreate },
  session: { count: sessionCount },
};

jest.unstable_mockModule('../src/lib/auth.js', () => ({
  auth: { api: { getSession } },
}));
jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: { ...tx, $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) },
}));
jest.unstable_mockModule('../src/lib/redis.js', () => ({ redis: {}, createRedis: jest.fn() }));
jest.unstable_mockModule('../src/lib/cloudinary.js', () => ({ uploadAvatar }));

const { app } = await import('../src/app.js');

const USER_ID = '7f1c3a52-0c3e-4f7b-9a43-3d0e2b8f4e11';
const NOW = new Date('2026-11-09T10:00:00.000Z');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    email: 'ayesha@example.com',
    name: 'Ayesha Rahman',
    emailVerified: true,
    image: null,
    userType: 'student',
    role: 'student',
    isActive: true,
    department: { id: 1, name: 'CSE' },
    departmentId: 1,
    bloodGroup: 'B+',
    phone: null,
    academicSession: '2022-2023',
    currentYear: 3,
    currentSemester: 1,
    studentId: 'CSE-2022/014',
    lastDonationDate: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function signedIn(user: Record<string, unknown> = {}) {
  getSession.mockResolvedValue({
    headers: new Headers(),
    response: {
      session: { id: 's1', userId: USER_ID },
      user: {
        id: USER_ID,
        userType: 'student',
        role: 'student',
        departmentId: 1,
        isActive: true,
        ...user,
      },
    },
  });
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.alloc(64),
]);

beforeEach(() => {
  for (const mock of [
    getSession,
    findUnique,
    update,
    count,
    auditCreate,
    sessionCount,
    uploadAvatar,
  ]) {
    mock.mockReset();
  }
  getSession.mockResolvedValue({ headers: new Headers(), response: null });
  findUnique.mockResolvedValue(row());
  update.mockImplementation(async (args) => row((args as { data: Record<string, unknown> }).data));
  count.mockResolvedValue(0);
  auditCreate.mockResolvedValue({ id: 1 });
  uploadAvatar.mockResolvedValue('https://res.cloudinary.com/demo/image/upload/v1/a.jpg');
});

describe('GET /api/v1/users/me', () => {
  it('returns the profile with an allowlisted select and no secrets', async () => {
    signedIn();

    const res = await request(app).get('/api/v1/users/me');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      id: USER_ID,
      email: 'ayesha@example.com',
      name: 'Ayesha Rahman',
      email_verified: true,
      avatar_url: null,
      user_type: 'student',
      role: 'student',
      is_active: true,
      department: { id: 1, name: 'CSE' },
      blood_group: 'B+',
      phone: null,
      academic_session: '2022-2023',
      current_year: 3,
      current_semester: 1,
      student_id: 'CSE-2022/014',
      last_donation_date: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    });
    const args = findUnique.mock.calls[0]?.[0] as { select: Record<string, unknown> };
    expect(args.select).not.toHaveProperty('accounts');
    expect(args.select).not.toHaveProperty('sessions');
    expect(JSON.stringify(res.body)).not.toMatch(/password|token/i);
  });

  it('formats last_donation_date as a date only', async () => {
    signedIn();
    findUnique.mockResolvedValue(row({ lastDonationDate: new Date('2026-05-01T00:00:00Z') }));

    const res = await request(app).get('/api/v1/users/me');

    expect(res.body.data.last_donation_date).toBe('2026-05-01');
  });

  it('401 without a session', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('403 for a suspended user', async () => {
    signedIn({ isActive: false });
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(403);
  });

  it('404 when the row is gone', async () => {
    signedIn();
    findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/users/me/sessions', () => {
  it('counts the other live sessions, excluding this one, and returns no tokens', async () => {
    signedIn();
    sessionCount.mockResolvedValue(2);

    const res = await request(app).get('/api/v1/users/me/sessions');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ other_sessions: 2 });
    const args = sessionCount.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ userId: USER_ID, NOT: { id: 's1' } });
    expect(args.where.expiresAt).toEqual({ gt: expect.any(Date) });
  });

  it('returns 401 without a session', async () => {
    expect((await request(app).get('/api/v1/users/me/sessions')).status).toBe(401);
  });
});

describe('PATCH /api/v1/users/me', () => {
  const patch = (body: unknown) =>
    request(app)
      .patch('/api/v1/users/me')
      .send(body as object);

  it('lets a student update personal and academic fields, and audits the change', async () => {
    signedIn();

    const res = await patch({
      name: '  Ayesha R.  ',
      phone: '+8801712345678',
      blood_group: 'O-',
      academic_session: '2023-2024',
      current_year: 4,
      current_semester: 2,
      student_id: 'CSE-2023/001',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      name: 'Ayesha R.',
      phone: '+8801712345678',
      blood_group: 'O-',
      academic_session: '2023-2024',
      current_year: 4,
      current_semester: 2,
      student_id: 'CSE-2023/001',
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: {
          name: 'Ayesha R.',
          phone: '+8801712345678',
          bloodGroup: 'O-',
          academicSession: '2023-2024',
          currentYear: 4,
          currentSemester: 2,
          studentId: 'CSE-2023/001',
        },
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_ID,
        action: AUDIT_ACTIONS.PROFILE_UPDATED,
        entityType: 'user',
        entityId: USER_ID,
        oldValue: expect.objectContaining({ name: 'Ayesha Rahman', student_id: 'CSE-2022/014' }),
        newValue: expect.objectContaining({ name: 'Ayesha R.', student_id: 'CSE-2023/001' }),
      }),
      select: { id: true },
    });
  });

  it('a student moderator still edits by user_type, not role', async () => {
    signedIn({ role: 'moderator' });
    const res = await patch({ current_year: 4 });
    expect(res.status).toBe(200);
  });

  it('lets faculty update name, phone and blood group', async () => {
    signedIn({ userType: 'faculty', role: 'faculty' });
    findUnique.mockResolvedValue(
      row({
        userType: 'faculty',
        role: 'faculty',
        academicSession: null,
        currentYear: null,
        currentSemester: null,
        studentId: null,
      }),
    );

    const res = await patch({ name: 'Dr. Karim', phone: '01712345678', blood_group: 'A+' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Dr. Karim', blood_group: 'A+' });
  });

  it.each(['student_id', 'academic_session', 'current_year', 'current_semester'])(
    'rejects %s from faculty with 400',
    async (field) => {
      signedIn({ userType: 'faculty', role: 'faculty' });
      const values: Record<string, unknown> = {
        student_id: 'X-1',
        academic_session: '2022-2023',
        current_year: 2,
        current_semester: 1,
      };

      const res = await patch({ [field]: values[field] });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('super_admin gets the staff field set', async () => {
    signedIn({ userType: 'super_admin', role: 'super_admin', departmentId: null });
    const res = await patch({ current_year: 2 });
    expect(res.status).toBe(400);
  });

  it.each([
    ['department_id', 2],
    ['role', 'super_admin'],
    ['user_type', 'faculty'],
    ['is_active', true],
    ['email', 'new@example.com'],
    ['avatar_url', 'https://evil.example/x.png'],
    ['email_verified', true],
    ['last_donation_date', '2026-01-01'],
    ['unknown', 'x'],
  ])('rejects %s with 400 (strict schema)', async (field, value) => {
    signedIn();

    const res = await patch({ name: 'Ok Name', [field]: value });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty body', {}],
    ['a bad phone', { phone: '12ab' }],
    ['a bad blood group', { blood_group: 'C+' }],
    ['a bad academic session', { academic_session: '2022-2025' }],
    ['year 5', { current_year: 5 }],
    ['semester 3', { current_semester: 3 }],
    ['a one-letter name', { name: 'A' }],
    ['a null name', { name: null }],
    ['a null blood group', { blood_group: null }],
    ['a null student id', { student_id: null }],
    ['a year as a string', { current_year: '3' }],
  ])('rejects %s with 400', async (_label, body) => {
    signedIn();
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('clears the phone with null', async () => {
    signedIn();
    findUnique.mockResolvedValue(row({ phone: '01712345678' }));

    const res = await patch({ phone: null });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBeNull();
  });

  it('409 when another student in the department holds the student ID', async () => {
    signedIn();
    count.mockResolvedValue(1);

    const res = await patch({ student_id: 'CSE-2022/099' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STUDENT_ID_TAKEN');
    expect(count).toHaveBeenCalledWith({
      where: { departmentId: 1, studentId: 'CSE-2022/099', NOT: { id: USER_ID } },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('skips the uniqueness check when the student ID is unchanged', async () => {
    signedIn();
    const res = await patch({ student_id: 'CSE-2022/014' });
    expect(res.status).toBe(200);
    expect(count).not.toHaveBeenCalled();
  });

  it('writes no audit row when nothing changed', async () => {
    signedIn();
    const res = await patch({ name: 'Ayesha Rahman' });
    expect(res.status).toBe(200);
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('401 without a session', async () => {
    const res = await patch({ name: 'Someone' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/users/me/avatar', () => {
  const upload = (buffer: Buffer, filename: string, contentType: string, field = 'avatar') =>
    request(app).patch('/api/v1/users/me/avatar').attach(field, buffer, { filename, contentType });

  it.each([
    ['JPEG', JPEG, 'a.jpg', 'image/jpeg'],
    ['PNG', PNG, 'a.png', 'image/png'],
    ['WebP', WEBP, 'a.webp', 'image/webp'],
  ])('uploads a %s and saves the Cloudinary URL', async (_label, buffer, name, type) => {
    signedIn();

    const res = await upload(buffer, name, type);

    expect(res.status).toBe(200);
    expect(res.body.data.avatar_url).toBe('https://res.cloudinary.com/demo/image/upload/v1/a.jpg');
    expect(uploadAvatar).toHaveBeenCalledWith(USER_ID, buffer);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { image: 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg' },
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: AUDIT_ACTIONS.AVATAR_UPDATED,
        oldValue: { avatar_url: null },
      }),
      select: { id: true },
    });
  });

  it('rejects a disallowed mimetype with 400', async () => {
    signedIn();
    const res = await upload(Buffer.from('GIF89a'), 'a.gif', 'image/gif');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('rejects a spoofed mimetype by its bytes', async () => {
    signedIn();
    const res = await upload(Buffer.from('<svg onload="x"></svg>'), 'a.jpg', 'image/jpeg');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('rejects a file over 5 MB with 400 FILE_TOO_LARGE', async () => {
    signedIn();
    const big = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(big, 'big.jpg', 'image/jpeg');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('rejects a file in the wrong field', async () => {
    signedIn();
    const res = await upload(JPEG, 'a.jpg', 'image/jpeg', 'photo');
    expect(res.status).toBe(400);
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('rejects a multipart body with no file', async () => {
    signedIn();
    const res = await request(app).patch('/api/v1/users/me/avatar').field('avatar', 'text');
    expect(res.status).toBe(400);
    expect(uploadAvatar).not.toHaveBeenCalled();
  });

  it('rejects a JSON body with 400 FILE_REQUIRED', async () => {
    signedIn();
    const res = await request(app)
      .patch('/api/v1/users/me/avatar')
      .send({ avatar_url: 'https://evil.example/x.png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
  });

  it('passes a Cloudinary failure through as the client module reports it', async () => {
    signedIn();
    const { AppError } = await import('../src/lib/http-error.js');
    uploadAvatar.mockRejectedValue(
      new AppError(502, 'UPLOAD_FAILED', 'The image could not be uploaded. Try again.'),
    );

    const res = await upload(JPEG, 'a.jpg', 'image/jpeg');

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPLOAD_FAILED');
    expect(update).not.toHaveBeenCalled();
  });

  it('401 without a session, before reading the file', async () => {
    const res = await upload(JPEG, 'a.jpg', 'image/jpeg');
    expect(res.status).toBe(401);
    expect(uploadAvatar).not.toHaveBeenCalled();
  });
});
