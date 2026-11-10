import {
  ORIGIN,
  PASSWORD,
  createUser,
  departmentId,
  fakeRedis,
  loadHarness,
  resetDatabase,
  signInCookie,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

// /api/v1/admin/users (PRD FR-USER-005, DECISIONS D28–D29) against the real database: row
// locks, session deletion inside the status transaction, audit rows and the
// users_student_id_per_dept index.

const h = await loadHarness();
const { app, prisma } = h;
let cse: number;
let ece: number;

beforeAll(async () => {
  cse = await departmentId(h, 'CSE');
  ece = await departmentId(h, 'ECE');
});
beforeEach(() => resetDatabase(h));

const BASE = '/api/v1/admin/users';
const MISSING = '00000000-0000-4000-8000-000000000000';

async function admin() {
  const id = await createUser(h, { email: 'admin@example.com', userType: 'super_admin' });
  return { id, cookie: await signInCookie(h, 'admin@example.com') };
}

const as = (cookie: string) => ({
  get: (path: string) => request(app).get(path).set('Origin', ORIGIN).set('Cookie', cookie),
  patch: (path: string, body: object) =>
    request(app).patch(path).set('Origin', ORIGIN).set('Cookie', cookie).send(body),
  post: (path: string) => request(app).post(path).set('Origin', ORIGIN).set('Cookie', cookie),
});

const audits = (action: string, entityId?: string) =>
  prisma.auditLog.findMany({ where: { action, ...(entityId && { entityId }) } });

async function club(deptId: number) {
  return prisma.club.upsert({
    where: { departmentId: deptId },
    update: {},
    create: { name: `Club ${deptId}`, departmentId: deptId },
    select: { id: true },
  });
}

describe('GET /api/v1/admin/users', () => {
  it('lists with pagination meta, newest first by default', async () => {
    const { cookie } = await admin();
    for (let i = 1; i <= 3; i++) {
      await createUser(h, { email: `s${i}@example.com`, userType: 'student', departmentId: cse });
    }

    const res = await as(cookie).get(`${BASE}?limit=2`);

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 2, total: 4, total_pages: 2 });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].email).toBe('s3@example.com');
    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      [
        'avatar_url',
        'created_at',
        'department',
        'email',
        'email_verified',
        'id',
        'is_active',
        'name',
        'role',
        'user_type',
      ].sort(),
    );

    const page2 = await as(cookie).get(`${BASE}?limit=2&page=2`);
    const ids = [...res.body.data, ...page2.body.data].map((u: { id: string }) => u.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('filters by role, user type, department, status and search', async () => {
    const { cookie } = await admin();
    await createUser(h, {
      email: 'nadia@example.com',
      name: 'Nadia Islam',
      userType: 'student',
      departmentId: cse,
    });
    await createUser(h, {
      email: 'rafi@example.com',
      userType: 'student',
      role: 'moderator',
      departmentId: ece,
    });
    await createUser(h, {
      email: 'karim@example.com',
      userType: 'faculty',
      departmentId: cse,
      isActive: false,
    });
    const emails = async (q: string) =>
      (await as(cookie).get(`${BASE}?${q}`)).body.data.map((u: { email: string }) => u.email);

    expect(await emails('role=moderator')).toEqual(['rafi@example.com']);
    expect(await emails('user_type=faculty')).toEqual(['karim@example.com']);
    expect(await emails(`department_id=${ece}`)).toEqual(['rafi@example.com']);
    expect(await emails('is_active=false')).toEqual(['karim@example.com']);
    expect(await emails('search=NADIA')).toEqual(['nadia@example.com']);
    expect(await emails('search=rafi%40')).toEqual(['rafi@example.com']);
    expect(await emails('sort=email&order=asc')).toEqual([
      'admin@example.com',
      'karim@example.com',
      'nadia@example.com',
      'rafi@example.com',
    ]);
  });

  it('rejects unknown and malformed query keys with 400', async () => {
    const { cookie } = await admin();
    for (const q of ['limit=500', 'page=0', 'sort=password', 'role=root', 'is_active=yes', 'x=1']) {
      const res = await as(cookie).get(`${BASE}?${q}`);
      expect([q, res.status]).toEqual([q, 400]);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns 401 without a session and 403 for every other role', async () => {
    expect((await request(app).get(BASE).set('Origin', ORIGIN)).status).toBe(401);
    const roles = [
      { email: 'st@example.com', userType: 'student', role: 'student' },
      { email: 'fa@example.com', userType: 'faculty', role: 'faculty' },
      { email: 'mo@example.com', userType: 'student', role: 'moderator' },
      { email: 'da@example.com', userType: 'faculty', role: 'dept_admin' },
    ] as const;
    for (const r of roles) {
      await createUser(h, { ...r, departmentId: cse });
      const res = await as(await signInCookie(h, r.email)).get(BASE);
      expect([r.role, res.status]).toEqual([r.role, 403]);
    }
  });
});

describe('GET /api/v1/admin/users/:id', () => {
  it('returns the profile, sessions, last login and role sources, without secrets', async () => {
    const { cookie } = await admin();
    const id = await createUser(h, {
      email: 'rafi@example.com',
      userType: 'student',
      role: 'moderator',
      departmentId: cse,
    });
    await signInCookie(h, 'rafi@example.com');
    const { id: clubId } = await club(cse);
    await prisma.clubCommitteeMember.create({
      data: { userId: id, clubId, position: 'President', termStartYear: 2026, termEndYear: 2027 },
    });

    const res = await as(cookie).get(`${BASE}/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id,
      email: 'rafi@example.com',
      role: 'moderator',
      active_sessions: 1,
      role_sources: {
        committee: [
          { club_id: clubId, position: 'President', term_start_year: 2026, term_end_year: 2027 },
        ],
        dept_admin: null,
      },
    });
    expect(res.body.data.last_login_at).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/password|token/i);
  });

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    const { cookie } = await admin();
    expect((await as(cookie).get(`${BASE}/not-a-uuid`)).status).toBe(400);
    expect((await as(cookie).get(`${BASE}/${MISSING}`)).status).toBe(404);
  });
});

describe('PATCH /api/v1/admin/users/:id/status', () => {
  it('suspends: deletes every session, blocks sign-in, audits with reason', async () => {
    const { id: adminId, cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      departmentId: cse,
    });
    const studentCookie = await signInCookie(h, 'st@example.com');
    await signInCookie(h, 'st@example.com');

    const res = await as(cookie).patch(`${BASE}/${id}/status`, {
      is_active: false,
      reason: 'Spam reports',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ is_active: false, active_sessions: 0 });
    expect(await prisma.session.count({ where: { userId: id } })).toBe(0);
    expect((await as(studentCookie).get('/api/v1/users/me')).status).toBe(401);
    const signIn = await request(app)
      .post('/api/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: 'st@example.com', password: PASSWORD });
    expect(signIn.status).toBe(403);

    const [row] = await audits(AUDIT_ACTIONS.USER_SUSPENDED, id);
    expect(row).toMatchObject({
      userId: adminId,
      oldValue: { is_active: true },
      newValue: { is_active: false, reason: 'Spam reports', sessions_revoked: 2 },
    });
  });

  it('activates again, and the user can sign in', async () => {
    const { cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      departmentId: cse,
      isActive: false,
    });

    const res = await as(cookie).patch(`${BASE}/${id}/status`, { is_active: true });

    expect(res.status).toBe(200);
    expect(res.body.data.is_active).toBe(true);
    expect(await audits(AUDIT_ACTIONS.USER_ACTIVATED, id)).toHaveLength(1);
    await expect(signInCookie(h, 'st@example.com')).resolves.toContain('session_token=');
  });

  it('is idempotent: the same state writes no audit row', async () => {
    const { cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      departmentId: cse,
    });

    const res = await as(cookie).patch(`${BASE}/${id}/status`, { is_active: true });

    expect(res.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { entityId: id } })).toBe(0);
  });

  it('locks the row: parallel suspends write exactly one audit row', async () => {
    const { cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      departmentId: cse,
    });

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        as(cookie).patch(`${BASE}/${id}/status`, { is_active: false }),
      ),
    );

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(await audits(AUDIT_ACTIONS.USER_SUSPENDED, id)).toHaveLength(1);
  });

  it('refuses the caller and other super admins with 403', async () => {
    const { id: adminId, cookie } = await admin();
    const other = await createUser(h, { email: 'root2@example.com', userType: 'super_admin' });

    const self = await as(cookie).patch(`${BASE}/${adminId}/status`, { is_active: false });
    const peer = await as(cookie).patch(`${BASE}/${other}/status`, { is_active: false });

    expect([self.status, self.body.error.code]).toEqual([403, 'CANNOT_MODIFY_SELF']);
    expect([peer.status, peer.body.error.code]).toEqual([403, 'CANNOT_MODIFY_SUPER_ADMIN']);
    expect(await prisma.user.count({ where: { isActive: false } })).toBe(0);
  });

  it('validates the body and the id', async () => {
    const { cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      departmentId: cse,
    });
    expect((await as(cookie).patch(`${BASE}/${id}/status`, {})).status).toBe(400);
    expect(
      (await as(cookie).patch(`${BASE}/${id}/status`, { is_active: false, role: 'x' })).status,
    ).toBe(400);
    expect((await as(cookie).patch(`${BASE}/${MISSING}/status`, { is_active: false })).status).toBe(
      404,
    );
  });
});

describe('POST /api/v1/admin/users/:id/recompute-role', () => {
  it('repairs a drifted role and audits ROLE_CHANGED with the admin as actor', async () => {
    const { id: adminId, cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      role: 'moderator',
      departmentId: cse,
    });

    const res = await as(cookie).post(`${BASE}/${id}/recompute-role`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ role: 'student', previous_role: 'moderator', changed: true });
    const [row] = await audits(AUDIT_ACTIONS.ROLE_CHANGED, id);
    expect(row).toMatchObject({
      userId: adminId,
      oldValue: { role: 'moderator' },
      newValue: { role: 'student' },
    });
  });

  it('keeps a role backed by a current term and writes nothing', async () => {
    const { cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      role: 'moderator',
      departmentId: cse,
    });
    const { id: clubId } = await club(cse);
    await prisma.clubCommitteeMember.create({
      data: { userId: id, clubId, position: 'Secretary', termStartYear: 2026, termEndYear: 2027 },
    });

    const res = await as(cookie).post(`${BASE}/${id}/recompute-role`);

    expect(res.body.data).toEqual({
      role: 'moderator',
      previous_role: 'moderator',
      changed: false,
    });
    expect(await audits(AUDIT_ACTIONS.ROLE_CHANGED, id)).toHaveLength(0);
  });

  it('returns 404 for an unknown user', async () => {
    const { cookie } = await admin();
    expect((await as(cookie).post(`${BASE}/${MISSING}/recompute-role`)).status).toBe(404);
  });
});

describe('PATCH /api/v1/admin/users/:id (assisting edit)', () => {
  it("edits a student's academic details and audits only the changed fields", async () => {
    const { id: adminId, cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      departmentId: cse,
    });

    const res = await as(cookie).patch(`${BASE}/${id}`, { current_semester: 2, current_year: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ current_semester: 2, current_year: 2 });
    const [row] = await audits(AUDIT_ACTIONS.USER_UPDATED_BY_ADMIN, id);
    expect(row).toMatchObject({
      userId: adminId,
      oldValue: { current_semester: 1 },
      newValue: { current_semester: 2 },
    });
  });

  it('writes nothing for a no-op save', async () => {
    const { cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      departmentId: cse,
    });
    const res = await as(cookie).patch(`${BASE}/${id}`, { current_year: 2 });
    expect(res.status).toBe(200);
    expect(await audits(AUDIT_ACTIONS.USER_UPDATED_BY_ADMIN, id)).toHaveLength(0);
  });

  it('rejects academic fields for faculty on those fields', async () => {
    const { cookie } = await admin();
    const id = await createUser(h, {
      email: 'fa@example.com',
      userType: 'faculty',
      departmentId: cse,
    });

    const res = await as(cookie).patch(`${BASE}/${id}`, { current_year: 2, name: 'Dr. K' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: 'current_year', message: 'Only students have academic details.' },
    ]);
  });

  it('moves a user with no terms to another department', async () => {
    const { cookie } = await admin();
    const id = await createUser(h, {
      email: 'fa@example.com',
      userType: 'faculty',
      departmentId: cse,
    });

    const res = await as(cookie).patch(`${BASE}/${id}`, { department_id: ece });

    expect(res.status).toBe(200);
    expect(res.body.data.department).toEqual({ id: ece, name: 'ECE' });
  });

  it('blocks a department change while a committee term is current', async () => {
    const { cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      role: 'moderator',
      departmentId: cse,
    });
    const { id: clubId } = await club(cse);
    await prisma.clubCommitteeMember.create({
      data: { userId: id, clubId, position: 'President', termStartYear: 2026, termEndYear: 2027 },
    });

    const res = await as(cookie).patch(`${BASE}/${id}`, { department_id: ece });

    expect([res.status, res.body.error.code]).toEqual([409, 'DEPARTMENT_CHANGE_BLOCKED']);
    expect((await prisma.user.findUnique({ where: { id } }))?.departmentId).toBe(cse);
  });

  it('checks the student ID against the department the user moves to', async () => {
    const { cookie } = await admin();
    await createUser(h, {
      email: 'other@example.com',
      userType: 'student',
      departmentId: ece,
      studentId: 'X-1',
    });
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      departmentId: cse,
      studentId: 'X-1',
    });

    const res = await as(cookie).patch(`${BASE}/${id}`, { department_id: ece });

    expect([res.status, res.body.error.code]).toEqual([409, 'STUDENT_ID_TAKEN']);
  });

  it('rejects an unknown department, role keys and super admin targets', async () => {
    const { id: adminId, cookie } = await admin();
    const id = await createUser(h, {
      email: 'st@example.com',
      userType: 'student',
      departmentId: cse,
    });

    const dept = await as(cookie).patch(`${BASE}/${id}`, { department_id: 9999 });
    const role = await as(cookie).patch(`${BASE}/${id}`, { role: 'super_admin' });
    const self = await as(cookie).patch(`${BASE}/${adminId}`, { name: 'Root' });

    expect([dept.status, dept.body.error.code]).toEqual([400, 'DEPARTMENT_NOT_FOUND']);
    expect(role.status).toBe(400);
    expect([self.status, self.body.error.code]).toEqual([403, 'CANNOT_MODIFY_SUPER_ADMIN']);
  });
});

describe('GET /api/v1/users/me/sessions and revoke-other-sessions', () => {
  it('counts other devices, and revoking them keeps this one', async () => {
    await createUser(h, { email: 'st@example.com', userType: 'student', departmentId: cse });
    const here = await signInCookie(h, 'st@example.com');
    const there = await signInCookie(h, 'st@example.com');
    await signInCookie(h, 'st@example.com');

    const before = await as(here).get('/api/v1/users/me/sessions');
    expect(before.body.data).toEqual({ other_sessions: 2 });

    const revoke = await as(here).post('/api/auth/revoke-other-sessions').send({});
    expect(revoke.status).toBe(200);

    expect((await as(here).get('/api/v1/users/me/sessions')).body.data).toEqual({
      other_sessions: 0,
    });
    expect((await as(there).get('/api/v1/users/me')).status).toBe(401);
  });
});

describe('per-account sign-in limit (review M1)', () => {
  it('returns 429 after 10 attempts for one email, whatever the password', async () => {
    await createUser(h, { email: 'st@example.com', userType: 'student', departmentId: cse });
    const attempt = (password: string) =>
      request(app)
        .post('/api/auth/sign-in/email')
        .set('Origin', ORIGIN)
        .send({ email: 'ST@example.com', password });

    for (let i = 0; i < 10; i++) expect((await attempt('Wrong!pass1')).status).toBe(401);
    const blocked = await attempt(PASSWORD);

    expect([blocked.status, blocked.body.code]).toEqual([429, 'RATE_LIMITED']);
    expect(fakeRedis.keys()).toContain('rl:email:/sign-in/email:st@example.com');
  });
});
