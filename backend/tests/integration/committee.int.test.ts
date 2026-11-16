import {
  ORIGIN,
  clubFor,
  createUser,
  departmentId,
  loadHarness,
  resetDatabase,
  signInCookie,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

// /api/v1/clubs/:id/committee (PRD FR-COMM-001–004, DECISIONS D12, D34) and the
// expire-committee-terms job, against the real database: role recompute, user-row locks,
// the one_current_position_per_user_club index and the audit rows.

const h = await loadHarness();
const { app, prisma } = h;
const { committeeService } = await import('../../src/modules/committee/committee.service.js');
const { todayInDhaka } = await import('../../src/lib/dates.js');

const YEAR = Number(todayInDhaka().slice(0, 4));

let cse: number;
let ece: number;
let cseClub: number;
let eceClub: number;

type Caller = 'student' | 'faculty' | 'moderator' | 'dept_admin' | 'super_admin' | 'ece_admin';
const callerIds = {} as Record<Caller, string>;
const cookies = {} as Record<Caller, string>;

// Callers have their role written directly (as in the RBAC matrix). The users being assigned
// are created fresh per test with no faked role, so every role change below is real.
const CALLERS: {
  key: Caller;
  role: string;
  userType: 'student' | 'faculty' | 'super_admin';
  dept: 'CSE' | 'ECE';
}[] = [
  { key: 'student', role: 'student', userType: 'student', dept: 'CSE' },
  { key: 'faculty', role: 'faculty', userType: 'faculty', dept: 'CSE' },
  { key: 'moderator', role: 'moderator', userType: 'student', dept: 'CSE' },
  { key: 'dept_admin', role: 'dept_admin', userType: 'faculty', dept: 'CSE' },
  { key: 'super_admin', role: 'super_admin', userType: 'super_admin', dept: 'CSE' },
  { key: 'ece_admin', role: 'dept_admin', userType: 'faculty', dept: 'ECE' },
];

let seq = 0;
/** A fresh, unprivileged user. */
async function newUser(
  userType: 'student' | 'faculty',
  dept: 'CSE' | 'ECE' = 'CSE',
  extra: { isActive?: boolean; name?: string } = {},
) {
  seq += 1;
  return createUser(h, {
    email: `target${seq}@committee.test`,
    name: extra.name ?? `Target ${seq}`,
    userType,
    departmentId: dept === 'CSE' ? cse : ece,
    isActive: extra.isActive,
  });
}

const roleOf = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } })).role;

const body = (userId: string, overrides: Record<string, unknown> = {}) => ({
  user_id: userId,
  position: 'President',
  term_start_year: YEAR,
  term_end_year: YEAR + 1,
  ...overrides,
});

const assign = (who: Caller, clubId: number, payload: object) =>
  request(app)
    .post(`/api/v1/clubs/${clubId}/committee`)
    .set('Origin', ORIGIN)
    .set('Cookie', cookies[who])
    .send(payload);

const endTerm = (who: Caller, clubId: number, memberId: number) =>
  request(app)
    .patch(`/api/v1/clubs/${clubId}/committee/${memberId}/end-term`)
    .set('Origin', ORIGIN)
    .set('Cookie', cookies[who]);

const edit = (who: Caller, clubId: number, memberId: number, payload: object) =>
  request(app)
    .patch(`/api/v1/clubs/${clubId}/committee/${memberId}`)
    .set('Origin', ORIGIN)
    .set('Cookie', cookies[who])
    .send(payload);

const audits = (action: string, entityId?: string) =>
  prisma.auditLog.findMany({
    where: { action, ...(entityId ? { entityId } : {}) },
    orderBy: { id: 'asc' },
  });

/** A real dept admin term, so the role comes from a term rather than a faked column. */
async function makeDeptAdmin(userId: string, deptId: number) {
  await prisma.departmentAdminTerm.create({
    data: {
      userId,
      departmentId: deptId,
      startDate: new Date(`${YEAR}-01-01T00:00:00.000Z`),
      endDate: new Date(`${YEAR + 1}-12-31T00:00:00.000Z`),
    },
  });
  await prisma.user.update({ where: { id: userId }, data: { role: 'dept_admin' } });
}

beforeAll(async () => {
  await resetDatabase(h);
  cse = await departmentId(h, 'CSE');
  ece = await departmentId(h, 'ECE');
  for (const c of CALLERS) {
    const email = `${c.key}@committee.test`;
    callerIds[c.key] = await createUser(h, {
      email,
      name: `Caller ${c.key}`,
      role: c.role,
      userType: c.userType,
      departmentId: c.dept === 'CSE' ? cse : ece,
    });
    cookies[c.key] = await signInCookie(h, email);
  }
});

beforeEach(async () => {
  cseClub = await clubFor(h, 'CSE');
  eceClub = await clubFor(h, 'ECE');
  await prisma.clubCommitteeMember.deleteMany();
  await prisma.departmentAdminTerm.deleteMany();
  await prisma.auditLog.deleteMany();
});

describe('POST /clubs/:id/committee', () => {
  it('assigns a student, makes them moderator and audits both changes in one go', async () => {
    const user = await newUser('student');
    const res = await assign('dept_admin', cseClub, body(user, { position: '  President ' }));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      club_id: cseClub,
      position: 'President',
      term_start_year: YEAR,
      term_end_year: YEAR + 1,
      is_current: true,
      user: { id: user, name: expect.any(String), avatar_url: null },
    });
    expect(res.body.data.user).not.toHaveProperty('email');
    expect(await roleOf(user)).toBe('moderator');

    const [assigned] = await audits(AUDIT_ACTIONS.ASSIGN_COMMITTEE_MEMBER);
    expect(assigned).toMatchObject({
      userId: callerIds.dept_admin,
      entityType: 'club_committee_member',
      entityId: String(res.body.data.id),
    });
    const [roleChanged] = await audits(AUDIT_ACTIONS.ROLE_CHANGED, user);
    expect(roleChanged).toMatchObject({
      userId: callerIds.dept_admin,
      oldValue: { role: 'student' },
      newValue: { role: 'moderator' },
    });
  });

  it('makes a faculty member moderator', async () => {
    const user = await newUser('faculty');
    expect((await assign('dept_admin', cseClub, body(user))).status).toBe(201);
    expect(await roleOf(user)).toBe('moderator');
  });

  it('lets super_admin assign in any department', async () => {
    const user = await newUser('student', 'ECE');
    expect((await assign('super_admin', eceClub, body(user))).status).toBe(201);
    expect(await roleOf(user)).toBe('moderator');
  });

  it('keeps a dept_admin given a seat as dept_admin, with no ROLE_CHANGED row', async () => {
    const user = await newUser('faculty');
    await makeDeptAdmin(user, cse);
    expect((await assign('super_admin', cseClub, body(user))).status).toBe(201);
    expect(await roleOf(user)).toBe('dept_admin');
    expect(await audits(AUDIT_ACTIONS.ROLE_CHANGED, user)).toHaveLength(0);
  });

  it('records a past term with is_current false and leaves the role alone', async () => {
    const user = await newUser('student');
    const res = await assign(
      'dept_admin',
      cseClub,
      body(user, { term_start_year: YEAR - 3, term_end_year: YEAR - 2, is_current: false }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.is_current).toBe(false);
    expect(await roleOf(user)).toBe('student');
  });

  it.each<Caller>(['student', 'faculty', 'moderator'])('is 403 for %s', async (who) => {
    const user = await newUser('student');
    const res = await assign(who, cseClub, body(user));
    expect(res.status).toBe(403);
    expect(await prisma.clubCommitteeMember.count()).toBe(0);
  });

  it("is 403 for another department's dept_admin", async () => {
    const user = await newUser('student');
    expect((await assign('ece_admin', cseClub, body(user))).status).toBe(403);
  });

  it('is 401 without a session', async () => {
    const res = await request(app)
      .post(`/api/v1/clubs/${cseClub}/committee`)
      .set('Origin', ORIGIN)
      .send(body(callerIds.student));
    expect(res.status).toBe(401);
  });

  it('is 400 for a bad body and for an unknown key', async () => {
    const user = await newUser('student');
    const bad = await assign('dept_admin', cseClub, body(user, { term_end_year: YEAR - 1 }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const unknown = await assign('dept_admin', cseClub, { ...body(user), role: 'moderator' });
    expect(unknown.status).toBe(400);
  });

  it('is 400 when a current term already ended last year', async () => {
    const user = await newUser('student');
    const res = await assign(
      'dept_admin',
      cseClub,
      body(user, { term_start_year: YEAR - 2, term_end_year: YEAR - 1 }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: 'term_end_year', message: expect.any(String) },
    ]);
  });

  it('is 400 for a user from another department, even for super_admin', async () => {
    const user = await newUser('student', 'ECE');
    const res = await assign('super_admin', cseClub, body(user));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('USER_NOT_IN_CLUB_DEPARTMENT');
    expect(await roleOf(user)).toBe('student');
  });

  it('is 400 for a super admin as the target', async () => {
    const res = await assign('super_admin', cseClub, body(callerIds.super_admin));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_COMMITTEE_USER');
  });

  it('is 404 for an unknown user or club', async () => {
    const missing = await assign(
      'super_admin',
      cseClub,
      body('00000000-0000-4000-8000-000000000000'),
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');
    const user = await newUser('student');
    expect((await assign('super_admin', 999999, body(user))).status).toBe(404);
  });

  it('is 409 for a suspended user', async () => {
    const user = await newUser('student', 'CSE', { isActive: false });
    const res = await assign('dept_admin', cseClub, body(user));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_SUSPENDED');
  });

  it('is 409 for a second current position in the same club', async () => {
    const user = await newUser('student');
    expect((await assign('dept_admin', cseClub, body(user))).status).toBe(201);
    const res = await assign('dept_admin', cseClub, body(user, { position: 'Secretary' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_ON_COMMITTEE');
  });

  it('race: two parallel assigns of one user give one 201 and one 409', async () => {
    const user = await newUser('student');
    const results = await Promise.all([
      assign('dept_admin', cseClub, body(user, { position: 'President' })),
      assign('super_admin', cseClub, body(user, { position: 'Secretary' })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.clubCommitteeMember.count({ where: { userId: user, isCurrent: true } }),
    ).toBe(1);
    expect(await audits(AUDIT_ACTIONS.ASSIGN_COMMITTEE_MEMBER)).toHaveLength(1);
    expect(await roleOf(user)).toBe('moderator');
  });
});

describe('GET /clubs/:id/committee', () => {
  it('lists current rows first for any signed-in user, without email', async () => {
    const a = await newUser('student');
    const b = await newUser('student');
    await assign('dept_admin', cseClub, body(a));
    await assign(
      'dept_admin',
      cseClub,
      body(b, {
        position: 'Treasurer',
        term_start_year: YEAR - 2,
        term_end_year: YEAR - 1,
        is_current: false,
      }),
    );

    const res = await request(app)
      .get(`/api/v1/clubs/${cseClub}/committee`)
      .set('Cookie', cookies.student);
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 2, total_pages: 1 });
    expect(res.body.data.map((m: { is_current: boolean }) => m.is_current)).toEqual([true, false]);
    expect(JSON.stringify(res.body)).not.toContain('@committee.test');

    const current = await request(app)
      .get(`/api/v1/clubs/${cseClub}/committee?is_current=true`)
      .set('Cookie', cookies.ece_admin);
    expect(current.body.data).toHaveLength(1);
  });

  it('is 401 without a session, 404 for an unknown club, 400 for a bad query', async () => {
    expect((await request(app).get(`/api/v1/clubs/${cseClub}/committee`)).status).toBe(401);
    const missing = await request(app)
      .get('/api/v1/clubs/999999/committee')
      .set('Cookie', cookies.student);
    expect(missing.status).toBe(404);
    const bad = await request(app)
      .get(`/api/v1/clubs/${cseClub}/committee?is_current=maybe`)
      .set('Cookie', cookies.student);
    expect(bad.status).toBe(400);
  });
});

describe('PATCH /clubs/:id/committee/:memberId', () => {
  it('edits position and years, audits the changed fields, and leaves the role alone', async () => {
    const user = await newUser('student');
    const { body: created } = await assign('dept_admin', cseClub, body(user));
    const res = await edit('dept_admin', cseClub, created.data.id, {
      position: 'Vice President',
      term_end_year: YEAR + 2,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ position: 'Vice President', term_end_year: YEAR + 2 });
    const [row] = await audits(AUDIT_ACTIONS.COMMITTEE_MEMBER_UPDATED);
    expect(row).toMatchObject({
      oldValue: { position: 'President', term_end_year: YEAR + 1 },
      newValue: { position: 'Vice President', term_end_year: YEAR + 2 },
    });
    expect(await roleOf(user)).toBe('moderator');
  });

  it('writes nothing for a no-op', async () => {
    const user = await newUser('student');
    const { body: created } = await assign('dept_admin', cseClub, body(user));
    const res = await edit('dept_admin', cseClub, created.data.id, { position: 'President' });
    expect(res.status).toBe(200);
    expect(await audits(AUDIT_ACTIONS.COMMITTEE_MEMBER_UPDATED)).toHaveLength(0);
  });

  it('is 400 when the end year would fall before the stored start year', async () => {
    const user = await newUser('student');
    const { body: created } = await assign('dept_admin', cseClub, body(user));
    const res = await edit('dept_admin', cseClub, created.data.id, { term_end_year: YEAR - 1 });
    expect(res.status).toBe(400);
  });

  it('is 404 for a member of another club and 403 across departments', async () => {
    const user = await newUser('student');
    const { body: created } = await assign('dept_admin', cseClub, body(user));
    expect((await edit('super_admin', eceClub, created.data.id, { position: 'X Y' })).status).toBe(
      404,
    );
    expect((await edit('ece_admin', cseClub, created.data.id, { position: 'X Y' })).status).toBe(
      403,
    );
    expect((await edit('moderator', cseClub, created.data.id, { position: 'X Y' })).status).toBe(
      403,
    );
  });

  it('is 400 for is_current or an unknown key', async () => {
    const user = await newUser('student');
    const { body: created } = await assign('dept_admin', cseClub, body(user));
    expect((await edit('dept_admin', cseClub, created.data.id, { is_current: false })).status).toBe(
      400,
    );
  });
});

describe('PATCH /clubs/:id/committee/:memberId/end-term', () => {
  it('ends the term, reverts a student to student and audits both rows', async () => {
    const user = await newUser('student');
    const { body: created } = await assign('dept_admin', cseClub, body(user));
    const res = await endTerm('dept_admin', cseClub, created.data.id);

    expect(res.status).toBe(200);
    expect(res.body.data.is_current).toBe(false);
    expect(await roleOf(user)).toBe('student');
    const [ended] = await audits(AUDIT_ACTIONS.END_COMMITTEE_TERM);
    expect(ended).toMatchObject({
      userId: callerIds.dept_admin,
      entityId: String(created.data.id),
    });
    const roleRows = await audits(AUDIT_ACTIONS.ROLE_CHANGED, user);
    expect(roleRows.map((r) => r.newValue)).toEqual([{ role: 'moderator' }, { role: 'student' }]);
  });

  it('reverts a faculty member to faculty', async () => {
    const user = await newUser('faculty');
    const { body: created } = await assign('dept_admin', cseClub, body(user));
    await endTerm('super_admin', cseClub, created.data.id);
    expect(await roleOf(user)).toBe('faculty');
  });

  it('keeps a dept_admin as dept_admin when their seat ends', async () => {
    const user = await newUser('faculty');
    await makeDeptAdmin(user, cse);
    const { body: created } = await assign('super_admin', cseClub, body(user));
    expect((await endTerm('super_admin', cseClub, created.data.id)).status).toBe(200);
    expect(await roleOf(user)).toBe('dept_admin');
  });

  it('is 409 the second time, 404 in the wrong club, 403 across departments', async () => {
    const user = await newUser('student');
    const { body: created } = await assign('dept_admin', cseClub, body(user));
    expect((await endTerm('ece_admin', cseClub, created.data.id)).status).toBe(403);
    expect((await endTerm('super_admin', eceClub, created.data.id)).status).toBe(404);
    expect((await endTerm('dept_admin', cseClub, created.data.id)).status).toBe(200);
    const again = await endTerm('dept_admin', cseClub, created.data.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TERM_ALREADY_ENDED');
    expect(await audits(AUDIT_ACTIONS.END_COMMITTEE_TERM)).toHaveLength(1);
  });

  it('race: two parallel ends give one 200 and one 409, and one audit row', async () => {
    const user = await newUser('student');
    const { body: created } = await assign('dept_admin', cseClub, body(user));
    const results = await Promise.all([
      endTerm('dept_admin', cseClub, created.data.id),
      endTerm('super_admin', cseClub, created.data.id),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await audits(AUDIT_ACTIONS.END_COMMITTEE_TERM)).toHaveLength(1);
    expect(await roleOf(user)).toBe('student');
  });

  it('race (D12): a seat assigned while the admin term ends leaves the user moderator', async () => {
    const user = await newUser('faculty');
    await makeDeptAdmin(user, cse);
    const term = await prisma.departmentAdminTerm.findFirstOrThrow({ where: { userId: user } });
    const [seat, ended] = await Promise.all([
      assign('super_admin', cseClub, body(user)),
      request(app)
        .patch(`/api/v1/admin/dept-admin-terms/${term.id}/end`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookies.super_admin),
    ]);
    expect(seat.status).toBe(201);
    expect(ended.status).toBe(200);
    expect(await roleOf(user)).toBe('moderator');
  });
});

describe('expire-committee-terms job', () => {
  it('ends terms whose last year has passed, reverts roles as system, and is idempotent', async () => {
    const stale = await newUser('student');
    const live = await newUser('student');
    const old = await prisma.clubCommitteeMember.create({
      data: {
        userId: stale,
        clubId: cseClub,
        position: 'President',
        termStartYear: YEAR - 2,
        termEndYear: YEAR - 1,
      },
    });
    await prisma.user.update({ where: { id: stale }, data: { role: 'moderator' } });
    await assign('dept_admin', cseClub, body(live, { term_end_year: YEAR }));

    expect(await committeeService.expireTerms()).toBe(1);
    expect(await committeeService.expireTerms()).toBe(0);

    expect(await roleOf(stale)).toBe('student');
    expect(await roleOf(live)).toBe('moderator');
    const [ended] = await audits(AUDIT_ACTIONS.END_COMMITTEE_TERM, String(old.id));
    expect(ended).toMatchObject({
      userId: null,
      newValue: expect.objectContaining({ reason: 'term_expired' }),
    });
    const [roleRow] = await audits(AUDIT_ACTIONS.ROLE_CHANGED, stale);
    expect(roleRow).toMatchObject({ userId: null, newValue: { role: 'student' } });
  });

  it('uses the year in Asia/Dhaka: 31 Dec 18:30 UTC is already next year', async () => {
    const user = await newUser('student');
    await prisma.clubCommitteeMember.create({
      data: {
        userId: user,
        clubId: cseClub,
        position: 'President',
        termStartYear: 2030,
        termEndYear: 2030,
      },
    });
    expect(await committeeService.expireTerms(new Date('2030-12-31T17:59:00.000Z'))).toBe(0);
    expect(await committeeService.expireTerms(new Date('2030-12-31T18:30:00.000Z'))).toBe(1);
  });
});

describe('GET /clubs/:id/committee/candidates', () => {
  const candidates = (who: Caller, clubId: number, query: string) =>
    request(app)
      .get(`/api/v1/clubs/${clubId}/committee/candidates?${query}`)
      .set('Cookie', cookies[who]);

  it("lists the club department's active students and faculty, marks seated ones, no email", async () => {
    // A name no other test uses, so earlier users can't crowd these out of the 20 results.
    const seated = await newUser('student', 'CSE', { name: 'Zorawar Candidate' });
    const free = await newUser('faculty', 'CSE', { name: 'Zubaida Candidate' });
    const inactive = await newUser('student', 'CSE', { isActive: false, name: 'Zahir Candidate' });
    const otherDept = await newUser('student', 'ECE', { name: 'Zeba Candidate' });
    await assign('dept_admin', cseClub, body(seated));

    const res = await candidates('dept_admin', cseClub, 'search=candidate&limit=20');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((c: { id: string }) => c.id);
    expect(ids).toEqual(expect.arrayContaining([seated, free]));
    expect(ids).not.toContain(inactive);
    expect(ids).not.toContain(otherDept);
    for (const c of res.body.data) {
      expect(Object.keys(c).sort()).toEqual(
        ['avatar_url', 'id', 'name', 'on_committee', 'student_id', 'user_type'].sort(),
      );
    }
    const byId = Object.fromEntries(
      res.body.data.map((c: { id: string; on_committee: boolean }) => [c.id, c.on_committee]),
    );
    expect(byId[seated]).toBe(true);
    expect(byId[free]).toBe(false);
    // Only CSE, only active, no super admin.
    const rows = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { departmentId: true, isActive: true, userType: true },
    });
    expect(
      rows.every((r) => r.departmentId === cse && r.isActive && r.userType !== 'super_admin'),
    ).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('@committee.test');
  });

  it('matches the student ID case-insensitively', async () => {
    const user = await newUser('student');
    const sid = (await prisma.user.findUniqueOrThrow({ where: { id: user } })).studentId!;
    const res = await candidates(
      'super_admin',
      cseClub,
      `search=${encodeURIComponent(sid.toUpperCase())}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { id: string }) => c.id)).toContain(user);
  });

  it('is 400 without search or with an unknown key', async () => {
    expect((await candidates('dept_admin', cseClub, '')).status).toBe(400);
    expect((await candidates('dept_admin', cseClub, 'search=a&role=x')).status).toBe(400);
    expect((await candidates('dept_admin', cseClub, 'search=a&limit=50')).status).toBe(400);
  });

  it.each<Caller>(['student', 'faculty', 'moderator', 'ece_admin'])(
    'is 403 for %s',
    async (who) => {
      expect((await candidates(who, cseClub, 'search=target')).status).toBe(403);
    },
  );

  it('is 401 without a session and 404 for an unknown club', async () => {
    expect(
      (await request(app).get(`/api/v1/clubs/${cseClub}/committee/candidates?search=a`)).status,
    ).toBe(401);
    expect((await candidates('super_admin', 999999, 'search=a')).status).toBe(404);
  });
});
