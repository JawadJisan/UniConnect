import {
  ORIGIN,
  createUser,
  departmentId,
  emailQueue,
  loadHarness,
  resetDatabase,
  sentEmails,
  signInCookie,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

// /api/v1/admin/dept-admin-terms (PRD FR-ADMIN-001–004, DECISIONS D12, D34) and the
// expire-dept-admin-terms job, against the real database: role recompute, the department and
// user locks, the dept_admin_one_current_per_* indexes and the audit rows.

const h = await loadHarness();
const { app, prisma } = h;
const { deptAdminTermService } =
  await import('../../src/modules/dept-admin-terms/dept-admin-term.service.js');
const { addDays, todayInDhaka } = await import('../../src/lib/dates.js');

const TODAY = todayInDhaka();
const YEAR = Number(TODAY.slice(0, 4));
const NEXT_YEAR_END = `${YEAR + 1}-12-31`;

let cse: number;
let ece: number;
let superId: string;
const cookies = {} as Record<'super_admin' | 'dept_admin' | 'faculty', string>;

let seq = 0;
async function newUser(
  userType: 'student' | 'faculty',
  dept: 'CSE' | 'ECE' = 'CSE',
  extra: { isActive?: boolean } = {},
) {
  seq += 1;
  return createUser(h, {
    email: `term${seq}@terms.test`,
    name: `Term User ${seq}`,
    userType,
    departmentId: dept === 'CSE' ? cse : ece,
    ...extra,
  });
}

const roleOf = async (id: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } })).role;

const audits = (action: string, entityId?: string) =>
  prisma.auditLog.findMany({
    where: { action, ...(entityId ? { entityId } : {}) },
    orderBy: { id: 'asc' },
  });

const post = (path: string, payload: object, who: keyof typeof cookies = 'super_admin') =>
  request(app)
    .post(`/api/v1/admin/dept-admin-terms${path}`)
    .set('Origin', ORIGIN)
    .set('Cookie', cookies[who])
    .send(payload);

const endTerm = (id: number, who: keyof typeof cookies = 'super_admin') =>
  request(app)
    .patch(`/api/v1/admin/dept-admin-terms/${id}/end`)
    .set('Origin', ORIGIN)
    .set('Cookie', cookies[who]);

const termBody = (userId: string, overrides: Record<string, unknown> = {}) => ({
  user_id: userId,
  department_id: cse,
  start_date: TODAY,
  end_date: NEXT_YEAR_END,
  ...overrides,
});

beforeAll(async () => {
  await resetDatabase(h);
  cse = await departmentId(h, 'CSE');
  ece = await departmentId(h, 'ECE');
  superId = await createUser(h, { email: 'super@terms.test', userType: 'super_admin' });
  cookies.super_admin = await signInCookie(h, 'super@terms.test');
  await createUser(h, {
    email: 'admin@terms.test',
    userType: 'faculty',
    role: 'dept_admin',
    departmentId: cse,
  });
  cookies.dept_admin = await signInCookie(h, 'admin@terms.test');
  await createUser(h, { email: 'fac@terms.test', userType: 'faculty', departmentId: cse });
  cookies.faculty = await signInCookie(h, 'fac@terms.test');
});

beforeEach(async () => {
  await prisma.clubCommitteeMember.deleteMany();
  await prisma.departmentAdminTerm.deleteMany();
  await prisma.auditLog.deleteMany();
  sentEmails.length = 0;
  emailQueue.down = false;
});

describe('POST /admin/dept-admin-terms', () => {
  it('assigns a faculty member, makes them dept_admin, audits and queues the email', async () => {
    const user = await newUser('faculty');
    const res = await post('', termBody(user));

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      start_date: TODAY,
      end_date: NEXT_YEAR_END,
      is_current: true,
      user: { id: user },
      department: { id: cse, name: 'CSE' },
    });
    expect(await roleOf(user)).toBe('dept_admin');

    const [assigned] = await audits(AUDIT_ACTIONS.ASSIGN_DEPT_ADMIN);
    expect(assigned).toMatchObject({ userId: superId, entityId: String(res.body.data.id) });
    const [roleRow] = await audits(AUDIT_ACTIONS.ROLE_CHANGED, user);
    expect(roleRow).toMatchObject({
      userId: superId,
      oldValue: { role: 'faculty' },
      newValue: { role: 'dept_admin' },
    });
    expect(sentEmails).toEqual([
      expect.objectContaining({ kind: 'dept-admin-assigned', departmentName: 'CSE' }),
    ]);
  });

  it('accepts a faculty moderator (user_type, not role) and ending the term leaves moderator', async () => {
    const user = await newUser('faculty');
    await prisma.clubCommitteeMember.create({
      data: {
        userId: user,
        clubId: (
          await prisma.club.upsert({
            where: { departmentId: cse },
            update: {},
            create: { departmentId: cse, name: 'CSE Club' },
          })
        ).id,
        position: 'Advisor',
        termStartYear: YEAR,
        termEndYear: YEAR + 1,
      },
    });
    await prisma.user.update({ where: { id: user }, data: { role: 'moderator' } });

    const res = await post('', termBody(user));
    expect(res.status).toBe(201);
    expect(await roleOf(user)).toBe('dept_admin');

    expect((await endTerm(res.body.data.id)).status).toBe(200);
    expect(await roleOf(user)).toBe('moderator');
  });

  it('commits the term even when the email queue is down', async () => {
    emailQueue.down = true;
    const user = await newUser('faculty');
    expect((await post('', termBody(user))).status).toBe(201);
    expect(await roleOf(user)).toBe('dept_admin');
  });

  it.each(['dept_admin', 'faculty'] as const)('is 403 for %s', async (who) => {
    const user = await newUser('faculty');
    expect((await post('', termBody(user), who)).status).toBe(403);
    expect(await prisma.departmentAdminTerm.count()).toBe(0);
  });

  it('is 401 without a session', async () => {
    const res = await request(app)
      .post('/api/v1/admin/dept-admin-terms')
      .set('Origin', ORIGIN)
      .send({});
    expect(res.status).toBe(401);
  });

  it.each([
    ['a student', 'student', {}, 'NOT_FACULTY'],
    ['faculty of another department', 'faculty-ece', {}, 'USER_NOT_IN_DEPARTMENT'],
    ['a future start', 'faculty', { start_date: addDays(TODAY, 1) }, 'VALIDATION_ERROR'],
    [
      'an end in the past',
      'faculty',
      { start_date: addDays(TODAY, -30), end_date: addDays(TODAY, -1) },
      'VALIDATION_ERROR',
    ],
    ['an unknown department', 'faculty', { department_id: 999999 }, 'DEPARTMENT_NOT_FOUND'],
    ['an unknown key', 'faculty', { is_current: true }, 'VALIDATION_ERROR'],
  ])('is 400 for %s', async (_label, kind, overrides, code) => {
    const user =
      kind === 'student'
        ? await newUser('student')
        : await newUser('faculty', kind === 'faculty-ece' ? 'ECE' : 'CSE');
    const res = await post('', termBody(user, overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
    expect(await prisma.departmentAdminTerm.count()).toBe(0);
  });

  it('is 404 for an unknown user', async () => {
    const res = await post('', termBody('00000000-0000-4000-8000-000000000000'));
    expect(res.status).toBe(404);
  });

  it('is 409 for a suspended user and when the department has an admin', async () => {
    const suspended = await newUser('faculty', 'CSE', { isActive: false });
    expect((await post('', termBody(suspended))).body.error.code).toBe('USER_SUSPENDED');

    const first = await newUser('faculty');
    const second = await newUser('faculty');
    expect((await post('', termBody(first))).status).toBe(201);
    const res = await post('', termBody(second));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEPARTMENT_HAS_ADMIN');
    expect(await roleOf(second)).toBe('faculty');
  });

  it('race: two faculty assigned to one department in parallel give one 201 and one 409', async () => {
    const a = await newUser('faculty');
    const b = await newUser('faculty');
    const results = await Promise.all([post('', termBody(a)), post('', termBody(b))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.departmentAdminTerm.count({ where: { departmentId: cse, isCurrent: true } }),
    ).toBe(1);
    const roles = [await roleOf(a), await roleOf(b)].sort();
    expect(roles).toEqual(['dept_admin', 'faculty']);
  });
});

describe('PATCH /admin/dept-admin-terms/:id/end', () => {
  it('ends the term, reverts to faculty and audits; a second end is 409', async () => {
    const user = await newUser('faculty');
    const { body } = await post('', termBody(user));
    const res = await endTerm(body.data.id);
    expect(res.status).toBe(200);
    expect(res.body.data.is_current).toBe(false);
    expect(await roleOf(user)).toBe('faculty');
    expect(await audits(AUDIT_ACTIONS.END_DEPT_ADMIN_TERM)).toHaveLength(1);

    const again = await endTerm(body.data.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TERM_ALREADY_ENDED');
  });

  it('is 404 for an unknown term, 400 for a bad id, 403 for dept_admin', async () => {
    expect((await endTerm(999999)).status).toBe(404);
    const bad = await request(app)
      .patch('/api/v1/admin/dept-admin-terms/abc/end')
      .set('Origin', ORIGIN)
      .set('Cookie', cookies.super_admin);
    expect(bad.status).toBe(400);
    expect((await endTerm(1, 'dept_admin')).status).toBe(403);
  });
});

describe('POST /admin/dept-admin-terms/:id/renew', () => {
  it('replaces the term in one transaction and the role never changes', async () => {
    const user = await newUser('faculty');
    const { body } = await post('', termBody(user, { end_date: addDays(TODAY, 10) }));
    await prisma.auditLog.deleteMany();

    const res = await post(`/${body.data.id}/renew`, {
      start_date: TODAY,
      end_date: `${YEAR + 2}-06-30`,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ is_current: true, end_date: `${YEAR + 2}-06-30` });
    expect(res.body.data.id).not.toBe(body.data.id);

    const rows = await prisma.departmentAdminTerm.findMany({
      where: { userId: user },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((r) => r.isCurrent)).toEqual([false, true]);
    expect(await roleOf(user)).toBe('dept_admin');
    expect(await audits(AUDIT_ACTIONS.RENEW_DEPT_ADMIN_TERM)).toHaveLength(1);
    expect(await audits(AUDIT_ACTIONS.ROLE_CHANGED)).toHaveLength(0);
  });

  it('is 409 for an ended term and 400 for bad dates', async () => {
    const user = await newUser('faculty');
    const { body } = await post('', termBody(user));
    const bad = await post(`/${body.data.id}/renew`, {
      start_date: TODAY,
      end_date: addDays(TODAY, -1),
    });
    expect(bad.status).toBe(400);
    await endTerm(body.data.id);
    const res = await post(`/${body.data.id}/renew`, {
      start_date: TODAY,
      end_date: NEXT_YEAR_END,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TERM_NOT_CURRENT');
  });
});

describe('GET /admin/dept-admin-terms', () => {
  it('lists with filters and pagination meta', async () => {
    const a = await newUser('faculty');
    const b = await newUser('faculty', 'ECE');
    const { body } = await post('', termBody(a));
    await endTerm(body.data.id);
    await post('', termBody(b, { department_id: ece }));

    const all = await request(app)
      .get('/api/v1/admin/dept-admin-terms')
      .set('Cookie', cookies.super_admin);
    expect(all.status).toBe(200);
    expect(all.body.meta).toMatchObject({ total: 2 });
    expect(all.body.data[0].is_current).toBe(true);

    const current = await request(app)
      .get(`/api/v1/admin/dept-admin-terms?is_current=false&department_id=${cse}`)
      .set('Cookie', cookies.super_admin);
    expect(current.body.data).toHaveLength(1);
    expect(current.body.data[0].user.id).toBe(a);

    const byUser = await request(app)
      .get(`/api/v1/admin/dept-admin-terms?user_id=${b}`)
      .set('Cookie', cookies.super_admin);
    expect(byUser.body.data).toHaveLength(1);
  });

  it('is 403 for dept_admin and 400 for an unknown filter', async () => {
    expect(
      (await request(app).get('/api/v1/admin/dept-admin-terms').set('Cookie', cookies.dept_admin))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/v1/admin/dept-admin-terms?role=x')
          .set('Cookie', cookies.super_admin)
      ).status,
    ).toBe(400);
  });
});

describe('expire-dept-admin-terms job', () => {
  it('ends terms whose last day was before today, as system, and is idempotent', async () => {
    const stale = await newUser('faculty');
    const lastDay = await newUser('faculty', 'ECE');
    const old = await prisma.departmentAdminTerm.create({
      data: {
        userId: stale,
        departmentId: cse,
        startDate: new Date(`${addDays(TODAY, -60)}T00:00:00.000Z`),
        endDate: new Date(`${addDays(TODAY, -1)}T00:00:00.000Z`),
      },
    });
    await prisma.user.update({ where: { id: stale }, data: { role: 'dept_admin' } });
    // A term whose last day is today is still running.
    expect(
      (await post('', termBody(lastDay, { department_id: ece, end_date: TODAY }))).status,
    ).toBe(201);

    expect(await deptAdminTermService.expireTerms()).toBe(1);
    expect(await deptAdminTermService.expireTerms()).toBe(0);

    expect(await roleOf(stale)).toBe('faculty');
    expect(await roleOf(lastDay)).toBe('dept_admin');
    const [ended] = await audits(AUDIT_ACTIONS.END_DEPT_ADMIN_TERM, String(old.id));
    expect(ended).toMatchObject({ userId: null });
    const [roleRow] = await audits(AUDIT_ACTIONS.ROLE_CHANGED, stale);
    expect(roleRow).toMatchObject({ userId: null, newValue: { role: 'faculty' } });
  });
});
