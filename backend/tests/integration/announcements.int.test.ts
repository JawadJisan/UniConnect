import {
  ORIGIN,
  clubFor,
  createUser,
  departmentId,
  loadHarness,
  resetDatabase,
  signInCookie,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

// FR-ANNOUNCE-001–004 against the real database (DECISIONS D15, D38): who may post where, the
// D15 feed for each kind of reader, edit and delete by author and admins, pin toggles, and the
// audit row each change writes in its own transaction.

// Fourteen sign-ins against Neon outlast the 30 s default, as in events.int.test.ts.
jest.setTimeout(180_000);

const h = await loadHarness();
const { app, prisma } = h;
const { toDbDate, todayInDhaka, addDays } = await import('../../src/lib/dates.js');

type Who =
  | 'student'
  | 'member'
  | 'expired'
  | 'lapsed'
  | 'cancelled'
  | 'faculty'
  | 'moderator'
  | 'moderator2'
  | 'ended_mod'
  | 'dept_admin'
  | 'super_admin'
  | 'ece_admin'
  | 'ece_member'
  | 'ece_moderator';

const ids = {} as Record<Who, string>;
const cookies = {} as Record<Who, string>;
let cse: number;
let ece: number;
let bba: number;
let cseClub: number;
let eceClub: number;
let bbaClub: number;

const send = (
  who: Who,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  body?: object,
) => {
  const req = request(app)[method](path).set('Origin', ORIGIN).set('Cookie', cookies[who]);
  return method === 'get' || method === 'delete' ? req : req.send(body ?? {});
};

const post = (who: Who, body: Record<string, unknown>) =>
  send(who, 'post', '/api/v1/announcements', {
    title: 'Exam week',
    content: 'Library opens at 7.',
    ...body,
  });

async function postId(who: Who, body: Record<string, unknown>) {
  const res = await post(who, body);
  if (res.status !== 201) throw new Error(`post failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.id as number;
}

const feed = async (who: Who, query = '') => {
  const res = await send(who, 'get', `/api/v1/announcements${query}`);
  expect(res.status).toBe(200);
  return res.body as { data: { id: number; [k: string]: unknown }[]; meta: Record<string, number> };
};
const feedIds = async (who: Who, query = '') => (await feed(who, query)).data.map((a) => a.id);

const audits = (action: string, id: number) =>
  prisma.auditLog.findMany({ where: { action, entityType: 'announcement', entityId: String(id) } });

async function membership(userId: string, clubId: number, status: string, endOffsetDays: number) {
  const today = todayInDhaka();
  await prisma.clubMembership.create({
    data: {
      userId,
      clubId,
      type: 'monthly',
      status,
      startDate: toDbDate(addDays(today, endOffsetDays - 30)),
      endDate: toDbDate(addDays(today, endOffsetDays)),
    },
  });
}

async function seat(userId: string, clubId: number) {
  const year = Number(todayInDhaka().slice(0, 4));
  await prisma.clubCommitteeMember.create({
    data: { clubId, userId, position: 'Member', termStartYear: year, termEndYear: year + 1 },
  });
}

beforeAll(async () => {
  await resetDatabase(h);
  cse = await departmentId(h, 'CSE');
  ece = await departmentId(h, 'ECE');
  bba = await departmentId(h, 'BBA');
  cseClub = await clubFor(h, 'CSE');
  eceClub = await clubFor(h, 'ECE');
  bbaClub = await clubFor(h, 'BBA');

  const people: [Who, 'student' | 'faculty' | 'super_admin', string, number][] = [
    ['student', 'student', 'student', cse],
    ['member', 'student', 'student', cse],
    ['expired', 'student', 'student', cse],
    ['lapsed', 'student', 'student', cse],
    ['cancelled', 'student', 'student', cse],
    ['faculty', 'faculty', 'faculty', cse],
    ['moderator', 'student', 'moderator', cse],
    ['moderator2', 'student', 'moderator', cse],
    ['ended_mod', 'student', 'moderator', cse],
    ['dept_admin', 'faculty', 'dept_admin', cse],
    ['super_admin', 'super_admin', 'super_admin', cse],
    ['ece_admin', 'faculty', 'dept_admin', ece],
    ['ece_member', 'student', 'student', ece],
    ['ece_moderator', 'student', 'moderator', ece],
  ];
  for (const [who, userType, role, dept] of people) {
    ids[who] = await createUser(h, {
      email: `${who}@announce.test`,
      name: who,
      userType,
      role,
      departmentId: dept,
    });
    cookies[who] = await signInCookie(h, `${who}@announce.test`);
  }
  // Real seats and memberships: the service reads them, not just the role.
  await seat(ids.moderator, cseClub);
  await seat(ids.moderator2, cseClub);
  await seat(ids.ended_mod, cseClub);
  await seat(ids.ece_moderator, eceClub);
  await membership(ids.member, cseClub, 'active', 20);
  await membership(ids.expired, cseClub, 'expired', -5);
  // Still `active` but past its end date: the expiry job hasn't run yet.
  await membership(ids.lapsed, cseClub, 'active', -1);
  await membership(ids.cancelled, cseClub, 'cancelled', 20);
  await membership(ids.ece_member, eceClub, 'active', 20);
  // ended_mod keeps a membership, so after their seat ends they still see their club post.
  await membership(ids.ended_mod, cseClub, 'active', 20);
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE announcements RESTART IDENTITY CASCADE');
  // Ids restart at 1, so earlier tests' audit rows would match the new rows' entity ids.
  await prisma.auditLog.deleteMany({ where: { entityType: 'announcement' } });
});

describe('POST /announcements (FR-ANNOUNCE-001)', () => {
  it('lets a moderator post to their seated club, and audits it', async () => {
    const res = await post('moderator', { club_id: cseClub });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      scope: 'club',
      club: { id: cseClub, name: 'CSE Club' },
      department: null,
      author: { id: ids.moderator, name: 'moderator' },
      is_pinned: false,
      can_manage: true,
      can_pin: false,
    });
    expect(res.body.data.author).not.toHaveProperty('email');
    const [row] = await audits(AUDIT_ACTIONS.ANNOUNCEMENT_CREATED, res.body.data.id);
    expect(row).toMatchObject({
      userId: ids.moderator,
      newValue: { scope: 'club', club_id: cseClub, department_id: null, is_pinned: false },
    });
  });

  it('refuses a moderator outside their club, on a department, or pinning', async () => {
    const other = await post('moderator', { club_id: eceClub });
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe('ANNOUNCEMENT_SCOPE_FORBIDDEN');
    expect((await post('moderator', { department_id: cse })).status).toBe(403);
    const pin = await post('moderator', { club_id: cseClub, is_pinned: true });
    expect(pin.status).toBe(403);
    expect(pin.body.error.code).toBe('PIN_FORBIDDEN');
    expect(await prisma.announcement.count()).toBe(0);
  });

  it('lets a dept admin post to their department or its club, pinned or not', async () => {
    const dept = await post('dept_admin', { department_id: cse, is_pinned: true });
    expect(dept.status).toBe(201);
    expect(dept.body.data).toMatchObject({
      scope: 'department',
      department: { id: cse, name: 'CSE' },
      club: null,
      is_pinned: true,
      can_manage: true,
      can_pin: true,
    });
    expect((await post('dept_admin', { club_id: cseClub })).status).toBe(201);
    expect((await post('dept_admin', { department_id: ece })).status).toBe(403);
    expect((await post('dept_admin', { club_id: eceClub })).status).toBe(403);
  });

  it('lets a super admin post anywhere', async () => {
    expect((await post('super_admin', { department_id: ece })).status).toBe(201);
    expect((await post('super_admin', { club_id: bbaClub, is_pinned: true })).status).toBe(201);
  });

  it('answers 404 for a missing club or department and 400 for a bad scope', async () => {
    const club = await post('super_admin', { club_id: 999999 });
    expect(club.status).toBe(404);
    expect(club.body.error.code).toBe('CLUB_NOT_FOUND');
    const dept = await post('super_admin', { department_id: 999999 });
    expect(dept.body.error.code).toBe('DEPARTMENT_NOT_FOUND');
    expect((await post('super_admin', {})).status).toBe(400);
    expect((await post('super_admin', { club_id: cseClub, department_id: cse })).status).toBe(400);
  });

  it.each(['student', 'faculty', 'member'] as const)('refuses a %s with 403', async (who) => {
    expect((await post(who, { club_id: cseClub })).status).toBe(403);
  });
});

describe('GET /announcements (FR-ANNOUNCE-002, D15)', () => {
  let cseDept: number;
  let cseClubPost: number;
  let eceDept: number;
  let eceClubPost: number;
  let bbaDept: number;

  beforeEach(async () => {
    cseDept = await postId('dept_admin', { department_id: cse });
    cseClubPost = await postId('moderator', { club_id: cseClub });
    eceDept = await postId('ece_admin', { department_id: ece });
    eceClubPost = await postId('ece_moderator', { club_id: eceClub });
    bbaDept = await postId('super_admin', { department_id: bba });
  });

  it.each([
    ['student', () => [cseDept]],
    ['faculty', () => [cseDept]],
    ['member', () => [cseClubPost, cseDept]],
    ['expired', () => [cseDept]],
    ['lapsed', () => [cseDept]],
    ['cancelled', () => [cseDept]],
    ['moderator', () => [cseClubPost, cseDept]],
    ['dept_admin', () => [cseClubPost, cseDept]],
    ['ece_member', () => [eceClubPost, eceDept]],
    ['ece_admin', () => [eceClubPost, eceDept]],
  ] as const)('shows a %s exactly their posts', async (who, expected) => {
    expect(await feedIds(who)).toEqual(expected());
  });

  it('shows a super admin everything, newest first', async () => {
    expect(await feedIds('super_admin')).toEqual([
      bbaDept,
      eceClubPost,
      eceDept,
      cseClubPost,
      cseDept,
    ]);
  });

  it('puts pinned posts first, then newest', async () => {
    await send('dept_admin', 'patch', `/api/v1/announcements/${cseDept}/pin`);
    expect(await feedIds('member')).toEqual([cseDept, cseClubPost]);
  });

  it('narrows by club, department and pin, never past the visible scope', async () => {
    expect(await feedIds('member', `?club_id=${cseClub}`)).toEqual([cseClubPost]);
    expect(await feedIds('member', `?department_id=${cse}`)).toEqual([cseDept]);
    expect(await feedIds('member', '?is_pinned=true')).toEqual([]);
    expect(await feedIds('student', `?club_id=${eceClub}`)).toEqual([]);
    expect(await feedIds('student', `?department_id=${ece}`)).toEqual([]);
  });

  it('pages with D9 meta', async () => {
    const page = await feed('super_admin', '?limit=2&page=2');
    expect(page.data.map((a) => a.id)).toEqual([eceDept, cseClubPost]);
    expect(page.meta).toEqual({ page: 2, limit: 2, total: 5, total_pages: 3 });
  });

  it('sets can_manage and can_pin per reader', async () => {
    const flags = async (who: Who) =>
      Object.fromEntries(
        (await feed(who)).data.map((a) => [a.id, [a.can_manage, a.can_pin]]),
      ) as Record<number, [boolean, boolean]>;
    expect(await flags('moderator')).toEqual({
      [cseClubPost]: [true, false],
      [cseDept]: [false, false],
    });
    expect(await flags('moderator2')).toEqual({
      [cseClubPost]: [false, false],
      [cseDept]: [false, false],
    });
    expect(await flags('dept_admin')).toEqual({
      [cseClubPost]: [true, true],
      [cseDept]: [true, true],
    });
    expect(await flags('member')).toEqual({
      [cseClubPost]: [false, false],
      [cseDept]: [false, false],
    });
  });
});

describe('PATCH and DELETE /announcements/:id (FR-ANNOUNCE-003)', () => {
  it('lets the seated author edit, auditing changed fields only', async () => {
    const id = await postId('moderator', { club_id: cseClub });
    const res = await send('moderator', 'patch', `/api/v1/announcements/${id}`, {
      title: 'Exam week moved',
      content: 'Library opens at 7.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'Exam week moved', can_manage: true });
    const [row] = await audits(AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED, id);
    expect(row).toMatchObject({
      oldValue: { title: 'Exam week' },
      newValue: { title: 'Exam week moved' },
    });
  });

  it('writes no audit row for a no-op edit', async () => {
    const id = await postId('dept_admin', { department_id: cse });
    const res = await send('dept_admin', 'patch', `/api/v1/announcements/${id}`, {
      title: 'Exam week',
    });
    expect(res.status).toBe(200);
    expect(await audits(AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED, id)).toHaveLength(0);
  });

  it('refuses another moderator of the same club with 403', async () => {
    const id = await postId('moderator', { club_id: cseClub });
    const res = await send('moderator2', 'patch', `/api/v1/announcements/${id}`, { title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ANNOUNCEMENT_FORBIDDEN');
    expect((await send('moderator2', 'delete', `/api/v1/announcements/${id}`)).status).toBe(403);
  });

  it('refuses the author once their seat has ended', async () => {
    const id = await postId('ended_mod', { club_id: cseClub });
    await prisma.clubCommitteeMember.updateMany({
      where: { userId: ids.ended_mod },
      data: { isCurrent: false },
    });
    try {
      const edit = await send('ended_mod', 'patch', `/api/v1/announcements/${id}`, { title: 'x' });
      expect(edit.status).toBe(403);
      expect((await send('ended_mod', 'delete', `/api/v1/announcements/${id}`)).status).toBe(403);
    } finally {
      await prisma.clubCommitteeMember.updateMany({
        where: { userId: ids.ended_mod },
        data: { isCurrent: true },
      });
    }
  });

  it("lets the department's admin edit a moderator's post", async () => {
    const id = await postId('moderator', { club_id: cseClub });
    const res = await send('dept_admin', 'patch', `/api/v1/announcements/${id}`, {
      content: 'Closed on Friday.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('Closed on Friday.');
  });

  it("hides another department's post and a missing one with 404", async () => {
    const id = await postId('dept_admin', { department_id: cse });
    const other = await send('ece_admin', 'patch', `/api/v1/announcements/${id}`, { title: 'x' });
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('ANNOUNCEMENT_NOT_FOUND');
    expect((await send('ece_admin', 'delete', `/api/v1/announcements/${id}`)).status).toBe(404);
    expect(
      (await send('super_admin', 'patch', '/api/v1/announcements/999999', { title: 'x' })).status,
    ).toBe(404);
  });

  it('deletes for the author and audits a snapshot', async () => {
    const id = await postId('moderator', { club_id: cseClub });
    const res = await send('moderator', 'delete', `/api/v1/announcements/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id });
    expect(await prisma.announcement.findUnique({ where: { id } })).toBeNull();
    const [row] = await audits(AUDIT_ACTIONS.ANNOUNCEMENT_DELETED, id);
    expect(row?.oldValue).toMatchObject({
      title: 'Exam week',
      content: 'Library opens at 7.',
      club_id: cseClub,
      author_id: ids.moderator,
    });
  });

  it('lets a super admin delete any post', async () => {
    const id = await postId('ece_admin', { department_id: ece });
    expect((await send('super_admin', 'delete', `/api/v1/announcements/${id}`)).status).toBe(200);
  });
});

describe('PATCH /announcements/:id/pin (FR-ANNOUNCE-004)', () => {
  it('toggles both ways and audits each', async () => {
    const id = await postId('moderator', { club_id: cseClub });
    const on = await send('dept_admin', 'patch', `/api/v1/announcements/${id}/pin`);
    expect(on.status).toBe(200);
    expect(on.body.data).toMatchObject({ is_pinned: true, can_pin: true });
    const off = await send('dept_admin', 'patch', `/api/v1/announcements/${id}/pin`);
    expect(off.body.data.is_pinned).toBe(false);
    expect(await audits(AUDIT_ACTIONS.ANNOUNCEMENT_PINNED, id)).toHaveLength(1);
    const [unpin] = await audits(AUDIT_ACTIONS.ANNOUNCEMENT_UNPINNED, id);
    expect(unpin).toMatchObject({ oldValue: { is_pinned: true }, newValue: { is_pinned: false } });
  });

  it("hides another department's post from its admin, and lets a super admin pin", async () => {
    const id = await postId('dept_admin', { department_id: cse });
    expect((await send('ece_admin', 'patch', `/api/v1/announcements/${id}/pin`)).status).toBe(404);
    const sa = await send('super_admin', 'patch', `/api/v1/announcements/${id}/pin`);
    expect(sa.body.data.is_pinned).toBe(true);
  });

  it('refuses a moderator, even the author', async () => {
    const id = await postId('moderator', { club_id: cseClub });
    expect((await send('moderator', 'patch', `/api/v1/announcements/${id}/pin`)).status).toBe(403);
  });
});
