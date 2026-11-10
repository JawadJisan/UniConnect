import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

// Unit tests for /api/v1/admin/users with Better Auth's session and Prisma mocked: the role
// gate, request validation and response shapes. Locks, session deletion, audit rows and the
// unique index run against the real database in tests/integration/admin-users.int.test.ts.

type SessionResult = { headers: Headers; response: unknown };
type Fn = (arg?: unknown) => Promise<unknown>;

const getSession = jest.fn<(args: unknown) => Promise<SessionResult>>();
const findMany = jest.fn<Fn>();
const count = jest.fn<Fn>();

jest.unstable_mockModule('../src/lib/auth.js', () => ({ auth: { api: { getSession } } }));
jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: { user: { findMany, count } },
}));
jest.unstable_mockModule('../src/lib/redis.js', () => ({ redis: {}, createRedis: jest.fn() }));

const { app } = await import('../src/app.js');

const ADMIN_ID = '1b7c0d6e-3f43-4a3f-9d0a-6a2f1d9e8c11';
const USER_ID = '7f1c3a52-0c3e-4f7b-9a43-3d0e2b8f4e11';
const NOW = new Date('2026-11-10T10:00:00.000Z');

function signedIn(role: string, extra: Record<string, unknown> = {}) {
  getSession.mockResolvedValue({
    headers: new Headers(),
    response: {
      session: { id: 's1', userId: ADMIN_ID },
      user: { id: ADMIN_ID, role, userType: role, departmentId: null, isActive: true, ...extra },
    },
  });
}

beforeEach(() => {
  for (const mock of [getSession, findMany, count]) mock.mockReset();
  getSession.mockResolvedValue({ headers: new Headers(), response: null });
  findMany.mockResolvedValue([]);
  count.mockResolvedValue(0);
});

const ROUTES = [
  ['get', '/api/v1/admin/users'],
  ['get', `/api/v1/admin/users/${USER_ID}`],
  ['patch', `/api/v1/admin/users/${USER_ID}`],
  ['patch', `/api/v1/admin/users/${USER_ID}/status`],
  ['post', `/api/v1/admin/users/${USER_ID}/recompute-role`],
] as const;

describe('admin users authorization', () => {
  it.each(ROUTES)('%s %s returns 401 without a session', async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(401);
  });

  it.each(['student', 'faculty', 'moderator', 'dept_admin'])(
    'returns 403 for %s on every route',
    async (role) => {
      signedIn(role);
      for (const [method, path] of ROUTES) {
        expect([path, (await request(app)[method](path)).status]).toEqual([path, 403]);
      }
      expect(findMany).not.toHaveBeenCalled();
    },
  );

  it('returns 403 for a suspended super admin', async () => {
    signedIn('super_admin', { isActive: false });
    expect((await request(app).get('/api/v1/admin/users')).status).toBe(403);
  });
});

describe('GET /api/v1/admin/users', () => {
  it('applies defaults, whitelisted sort and a stable tiebreaker', async () => {
    signedIn('super_admin');
    count.mockResolvedValue(41);
    findMany.mockResolvedValue([
      {
        id: USER_ID,
        name: 'Ayesha Rahman',
        email: 'ayesha@example.com',
        image: null,
        userType: 'student',
        role: 'student',
        department: { id: 1, name: 'CSE' },
        isActive: true,
        emailVerified: true,
        createdAt: NOW,
      },
    ]);

    const res = await request(app).get('/api/v1/admin/users?page=3&search=%20ayesha%20');

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 3, limit: 20, total: 41, total_pages: 3 });
    expect(res.body.data[0]).toEqual({
      id: USER_ID,
      name: 'Ayesha Rahman',
      email: 'ayesha@example.com',
      avatar_url: null,
      user_type: 'student',
      role: 'student',
      department: { id: 1, name: 'CSE' },
      is_active: true,
      email_verified: true,
      created_at: NOW.toISOString(),
    });
    const args = findMany.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args).toMatchObject({
      skip: 40,
      take: 20,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      where: {
        OR: [
          { name: { contains: 'ayesha', mode: 'insensitive' } },
          { email: { contains: 'ayesha', mode: 'insensitive' } },
        ],
      },
    });
    expect(args.select).not.toHaveProperty('accounts');
    expect(args.select).not.toHaveProperty('sessions');
  });

  it.each([
    'limit=101',
    'page=0',
    'sort=password',
    'order=up',
    'role=root',
    'is_active=1',
    'department_id=abc',
    'unknown=1',
  ])('rejects %s with 400', async (q) => {
    signedIn('super_admin');
    const res = await request(app).get(`/api/v1/admin/users?${q}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('request validation', () => {
  beforeEach(() => signedIn('super_admin'));

  it('rejects a malformed id with 400', async () => {
    const res = await request(app).get('/api/v1/admin/users/123');
    expect([res.status, res.body.error.code]).toEqual([400, 'VALIDATION_ERROR']);
  });

  it.each([
    {},
    { is_active: 'no' },
    { is_active: false, role: 'x' },
    { is_active: false, reason: 'x'.repeat(501) },
  ])('rejects status body %j with 400', async (body) => {
    const res = await request(app).patch(`/api/v1/admin/users/${USER_ID}/status`).send(body);
    expect(res.status).toBe(400);
  });

  it.each([
    {},
    { role: 'super_admin' },
    { user_type: 'faculty' },
    { current_year: 7 },
    { email: 'x@y.z' },
  ])('rejects edit body %j with 400', async (body) => {
    const res = await request(app).patch(`/api/v1/admin/users/${USER_ID}`).send(body);
    expect(res.status).toBe(400);
  });
});
