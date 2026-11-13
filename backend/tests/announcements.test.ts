import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ANNOUNCEMENT_CONTENT_MAX,
  SCOPE_EXCLUSIVE,
  SCOPE_REQUIRED,
  announcementListQuerySchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from '@uniconnect/shared';
import express from 'express';
import request from 'supertest';

// Pure rules of the announcements module (PRD FR-ANNOUNCE, DECISIONS D15, D38): request
// schemas, the access rules, the response mapping, and the route guards that run before any
// database call. The feed query, locks and audit rows run against the real database in
// tests/integration/announcements.int.test.ts.

type SessionResult = { headers: Headers; response: unknown };
const getSession = jest.fn<(args: unknown) => Promise<SessionResult>>();

jest.unstable_mockModule('../src/lib/auth.js', () => ({ auth: { api: { getSession } } }));
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));

const { canCreateWith, canManageWith, canPinWith, canSeeWith } =
  await import('../src/modules/announcements/announcement.access.js');
const { toAnnouncement, toFacts } =
  await import('../src/modules/announcements/announcement.mapper.js');
const { whereVisible } = await import('../src/modules/announcements/announcement.repository.js');
const { announcementRouter } = await import('../src/modules/announcements/announcement.routes.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');

const caller = (role: string, departmentId: number | null = 1, id = 'me') => ({
  id,
  role,
  departmentId,
  ip: null,
});

/** A club post of club 10 in department 1, or a department post of department 1. */
const clubPost = (authorId = 'me') => ({
  clubId: 10,
  departmentId: null,
  clubDepartmentId: 1,
  authorId,
});
const deptPost = (departmentId = 1) => ({
  clubId: null,
  departmentId,
  clubDepartmentId: null,
  authorId: 'someone',
});

describe('createAnnouncementSchema (FR-ANNOUNCE-001)', () => {
  const base = { title: '  Exam week  ', content: ' Library opens at 7. ' };

  it('accepts one scope and trims the text', () => {
    expect(createAnnouncementSchema.parse({ ...base, club_id: 3 })).toEqual({
      title: 'Exam week',
      content: 'Library opens at 7.',
      club_id: 3,
    });
    expect(createAnnouncementSchema.parse({ ...base, department_id: 2, is_pinned: true })).toEqual({
      title: 'Exam week',
      content: 'Library opens at 7.',
      department_id: 2,
      is_pinned: true,
    });
  });

  it('refuses neither scope and both scopes (D38 XOR)', () => {
    const none = createAnnouncementSchema.safeParse(base);
    expect(none.success).toBe(false);
    expect(none.error?.issues[0]).toMatchObject({ path: ['club_id'], message: SCOPE_REQUIRED });
    const both = createAnnouncementSchema.safeParse({ ...base, club_id: 1, department_id: 1 });
    expect(both.success).toBe(false);
    expect(both.error?.issues[0]).toMatchObject({ path: ['club_id'], message: SCOPE_EXCLUSIVE });
  });

  it.each([
    ['an empty title', { title: '   ' }],
    ['a 201-character title', { title: 'x'.repeat(201) }],
    ['empty content', { content: ' ' }],
    ['content over the limit', { content: 'x'.repeat(ANNOUNCEMENT_CONTENT_MAX + 1) }],
    ['an unknown key', { author_id: 'someone' }],
    ['a string pin flag', { is_pinned: 'yes' }],
    ['a zero club id', { club_id: 0 }],
  ])('refuses %s', (_label, change) => {
    expect(createAnnouncementSchema.safeParse({ ...base, club_id: 1, ...change }).success).toBe(
      false,
    );
  });

  it('accepts exactly 200 and 10,000 characters', () => {
    const ok = createAnnouncementSchema.safeParse({
      title: 'x'.repeat(200),
      content: 'y'.repeat(ANNOUNCEMENT_CONTENT_MAX),
      department_id: 1,
    });
    expect(ok.success).toBe(true);
  });
});

describe('updateAnnouncementSchema (FR-ANNOUNCE-003)', () => {
  it('takes title or content, never the scope', () => {
    expect(updateAnnouncementSchema.parse({ title: ' New ' })).toEqual({ title: 'New' });
    expect(updateAnnouncementSchema.safeParse({}).success).toBe(false);
    expect(updateAnnouncementSchema.safeParse({ club_id: 2 }).success).toBe(false);
    expect(updateAnnouncementSchema.safeParse({ is_pinned: true }).success).toBe(false);
  });
});

describe('announcementListQuerySchema (FR-ANNOUNCE-002)', () => {
  it('coerces ids, page and the pin filter', () => {
    expect(
      announcementListQuerySchema.parse({ club_id: '3', is_pinned: 'true', page: '2' }),
    ).toEqual({ club_id: 3, is_pinned: true, page: 2, limit: 20 });
    expect(announcementListQuerySchema.parse({ is_pinned: 'false' }).is_pinned).toBe(false);
  });

  it.each([{ is_pinned: 'maybe' }, { limit: '101' }, { club_id: 'x' }, { sort: 'title' }])(
    'refuses %o',
    (q) => {
      expect(announcementListQuerySchema.safeParse(q).success).toBe(false);
    },
  );
});

describe('canSeeWith (D15)', () => {
  const scope = {
    all: false as const,
    departmentIds: [1],
    clubIds: [10],
    seatClubIds: [],
  };

  it('shows department posts of the own department only', () => {
    expect(canSeeWith(deptPost(1), scope)).toBe(true);
    expect(canSeeWith(deptPost(2), scope)).toBe(false);
  });

  it('shows club posts only for clubs in the scope', () => {
    expect(canSeeWith(clubPost(), scope)).toBe(true);
    expect(canSeeWith(clubPost(), { ...scope, clubIds: [] })).toBe(false);
  });

  it('shows everything to a super admin', () => {
    expect(canSeeWith(deptPost(9), { all: true, seatClubIds: [] })).toBe(true);
  });
});

describe('canCreateWith (FR-ANNOUNCE-001)', () => {
  const club = { kind: 'club' as const, clubId: 10, clubDepartmentId: 1 };
  const otherClub = { kind: 'club' as const, clubId: 20, clubDepartmentId: 2 };
  const dept = { kind: 'department' as const, departmentId: 1 };
  const otherDept = { kind: 'department' as const, departmentId: 2 };

  it.each([
    ['super_admin', otherClub, false, true],
    ['super_admin', otherDept, false, true],
    ['dept_admin', dept, false, true],
    ['dept_admin', club, false, true],
    ['dept_admin', otherDept, false, false],
    ['dept_admin', otherClub, false, false],
    ['moderator', club, true, true],
    ['moderator', club, false, false],
    ['moderator', dept, true, false],
    ['student', club, true, false],
    ['faculty', dept, false, false],
  ] as const)('%s → %o (seat %s) is %s', (role, target, seat, expected) => {
    expect(canCreateWith(caller(role), target, seat)).toBe(expected);
  });
});

describe('canManageWith and canPinWith (FR-ANNOUNCE-003, -004)', () => {
  it('lets a seated author moderator manage, but never pin', () => {
    expect(canManageWith(caller('moderator'), clubPost('me'), true)).toBe(true);
    expect(canPinWith(caller('moderator'), clubPost('me'))).toBe(false);
  });

  it('refuses a moderator whose seat ended, or who is not the author', () => {
    expect(canManageWith(caller('moderator'), clubPost('me'), false)).toBe(false);
    expect(canManageWith(caller('moderator'), clubPost('someone'), true)).toBe(false);
  });

  it("lets a dept admin manage and pin their department's posts and club posts", () => {
    for (const row of [deptPost(1), clubPost('someone')]) {
      expect(canManageWith(caller('dept_admin', 1), row, false)).toBe(true);
      expect(canPinWith(caller('dept_admin', 1), row)).toBe(true);
      expect(canManageWith(caller('dept_admin', 2), row, false)).toBe(false);
      expect(canPinWith(caller('dept_admin', 2), row)).toBe(false);
    }
  });

  it('lets a super admin do both, and nobody else', () => {
    expect(canManageWith(caller('super_admin', null), deptPost(5), false)).toBe(true);
    expect(canPinWith(caller('super_admin', null), clubPost('x'))).toBe(true);
    expect(canManageWith(caller('student'), clubPost('me'), true)).toBe(false);
    expect(canPinWith(caller('faculty'), deptPost(1))).toBe(false);
  });
});

describe('whereVisible', () => {
  it('adds no visibility clause for a super admin, only the filters', () => {
    expect(whereVisible({ all: true, seatClubIds: [] }, { is_pinned: true })).toEqual({
      AND: [{ isPinned: true }],
    });
  });

  it('ORs the department and club ids, then ANDs the filters', () => {
    const where = whereVisible(
      { all: false, departmentIds: [1], clubIds: [10, 11], seatClubIds: [] },
      { club_id: 10 },
    );
    expect(where).toEqual({
      AND: [{ OR: [{ departmentId: { in: [1] } }, { clubId: { in: [10, 11] } }] }, { clubId: 10 }],
    });
  });
});

describe('toAnnouncement', () => {
  const row = {
    id: 7,
    title: 'Exam week',
    content: 'Library opens at 7.',
    isPinned: true,
    createdAt: new Date('2030-01-01T00:00:00Z'),
    updatedAt: new Date('2030-01-02T00:00:00Z'),
    clubId: 10,
    departmentId: null,
    authorId: 'a1',
    club: { id: 10, name: 'CSE Club', departmentId: 1 },
    department: null,
    author: { id: 'a1', name: 'Ayesha', email: 'ayesha@example.com' },
  };

  it('maps the scope and never includes the author email', () => {
    const out = toAnnouncement(row, { canManage: true, canPin: false });
    expect(out).toEqual({
      id: 7,
      title: 'Exam week',
      content: 'Library opens at 7.',
      is_pinned: true,
      scope: 'club',
      club: { id: 10, name: 'CSE Club' },
      department: null,
      author: { id: 'a1', name: 'Ayesha' },
      created_at: '2030-01-01T00:00:00.000Z',
      updated_at: '2030-01-02T00:00:00.000Z',
      can_manage: true,
      can_pin: false,
    });
    expect(JSON.stringify(out)).not.toContain('ayesha@example.com');
    expect(toFacts(row)).toEqual({
      clubId: 10,
      departmentId: null,
      clubDepartmentId: 1,
      authorId: 'a1',
    });
  });
});

describe('route guards (before any database call)', () => {
  const app = express();
  app.use(express.json());
  app.use('/announcements', announcementRouter);
  app.use(errorHandler);

  function signedIn(role: string) {
    getSession.mockResolvedValue({
      headers: new Headers(),
      response: {
        session: { id: 's1', userId: 'u1' },
        user: {
          id: 'u1',
          role,
          userType: role === 'super_admin' ? 'super_admin' : 'student',
          departmentId: 1,
          isActive: true,
        },
      },
    });
  }

  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({ headers: new Headers(), response: null });
  });

  it('returns 401 without a session on every route', async () => {
    const calls = [
      request(app).get('/announcements'),
      request(app).post('/announcements').send({ title: 't', content: 'c', club_id: 1 }),
      request(app).patch('/announcements/1').send({ title: 't' }),
      request(app).delete('/announcements/1'),
      request(app).patch('/announcements/1/pin'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it.each(['student', 'faculty'])('refuses a %s on every write route with 403', async (role) => {
    signedIn(role);
    const calls = [
      request(app).post('/announcements').send({ title: 't', content: 'c', club_id: 1 }),
      request(app).patch('/announcements/1').send({ title: 't' }),
      request(app).delete('/announcements/1'),
      request(app).patch('/announcements/1/pin'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
  });

  it('refuses a moderator on pin with 403', async () => {
    signedIn('moderator');
    expect((await request(app).patch('/announcements/1/pin')).status).toBe(403);
  });

  it('returns 400 for a bad body, id or query', async () => {
    signedIn('dept_admin');
    const bad = await Promise.all([
      request(app).post('/announcements').send({ title: 't', content: 'c' }),
      request(app)
        .post('/announcements')
        .send({ title: 't', content: 'c', club_id: 1, department_id: 1 }),
      request(app).patch('/announcements/1').send({}),
      request(app).patch('/announcements/abc').send({ title: 't' }),
      request(app).get('/announcements?is_pinned=maybe'),
    ]);
    for (const res of bad) expect(res.status).toBe(400);
  });
});
