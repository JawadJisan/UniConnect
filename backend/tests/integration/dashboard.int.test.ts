import {
  ORIGIN,
  clubFor,
  createUser,
  departmentId,
  loadHarness,
  queueHealthState,
  resetDatabase,
  signInCookie,
} from './harness.js';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

// FR-DASH-001–004 and FR-AUDIT-002 against the real database (DECISIONS D13, D42): the
// personal view for every student and faculty account (D13), the moderator, dept admin and
// super admin views scoped and counted from seeded rows, and the audit-log viewer's filters,
// Dhaka-day boundaries and paging. One seed for the whole file; nothing here writes.

jest.setTimeout(240_000);

const h = await loadHarness();
const { app, prisma } = h;
const { addDays, toDbDate, todayInDhaka } = await import('../../src/lib/dates.js');
const { dhakaMonth } = await import('../../src/modules/dashboard/dashboard.caller.js');

type Who =
  | 'student'
  | 'faculty'
  | 'moderator'
  | 'stale_mod'
  | 'cse_admin'
  | 'ece_admin'
  | 'ece_student'
  | 'super_admin';

const ids = {} as Record<Who, string>;
const cookies = {} as Record<Who, string>;
let cse = 0;
let ece = 0;
let cseClub = 0;
let eceClub = 0;
const ev = {} as Record<'cseUpcoming' | 'eceMembersOnly' | 'cseDraft' | 'cseThisMonth', number>;

const get = (who: Who, path: string) =>
  request(app).get(path).set('Origin', ORIGIN).set('Cookie', cookies[who]);

const today = todayInDhaka();
const month = dhakaMonth(today);
/** Upcoming and never in the current Dhaka month, so month counts stay exact. */
const nextMonth = new Date(month.to.getTime() + 2 * 86_400_000);

async function event(
  clubId: number,
  creator: string,
  departments: number[],
  data: { status: string; start: Date; visibility?: string; title: string },
) {
  const row = await prisma.event.create({
    data: {
      title: data.title,
      organizerClubId: clubId,
      visibility: data.visibility ?? 'public',
      startDate: data.start,
      endDate: new Date(data.start.getTime() + 2 * 3_600_000),
      status: data.status,
      createdById: creator,
      departments: { create: departments.map((departmentId) => ({ departmentId })) },
    },
  });
  return row.id;
}

async function membership(userId: string, clubId: number, amount: string, payment: string) {
  const m = await prisma.clubMembership.create({
    data: {
      userId,
      clubId,
      type: 'monthly',
      status: 'active',
      startDate: toDbDate(addDays(today, -10)),
      endDate: toDbDate(addDays(today, 20)),
    },
  });
  await prisma.paymentTransaction.create({
    data: {
      userId,
      clubMembershipId: m.id,
      amount,
      transactionId: `TX-${userId}-${payment}`,
      paymentStatus: payment,
    },
  });
}

const bloodRequest = (requesterId: string, bloodGroup: string, status = 'pending') =>
  prisma.bloodRequest.create({
    data: {
      requesterId,
      patientName: `P-${bloodGroup}-${status}`,
      bloodGroup,
      unitsNeeded: 1,
      contactPhone: '01700000000',
      hospitalName: 'H',
      requiredByDate: toDbDate(addDays(today, 3)),
      status,
      ...(status === 'fulfilled' ? { fulfilledById: ids.faculty, resolvedAt: new Date() } : {}),
    },
  });

beforeAll(async () => {
  await resetDatabase(h);
  cse = await departmentId(h, 'CSE');
  ece = await departmentId(h, 'ECE');
  cseClub = await clubFor(h, 'CSE');
  eceClub = await clubFor(h, 'ECE');
  const accounts: Record<
    Who,
    { userType: 'student' | 'faculty' | 'super_admin'; role?: string; dept?: number }
  > = {
    student: { userType: 'student', dept: cse },
    faculty: { userType: 'faculty', dept: cse },
    moderator: { userType: 'student', role: 'moderator', dept: cse },
    stale_mod: { userType: 'student', role: 'moderator', dept: cse },
    cse_admin: { userType: 'faculty', role: 'dept_admin', dept: cse },
    ece_admin: { userType: 'faculty', role: 'dept_admin', dept: ece },
    ece_student: { userType: 'student', dept: ece },
    super_admin: { userType: 'super_admin' },
  };
  for (const [who, a] of Object.entries(accounts) as [Who, (typeof accounts)[Who]][]) {
    const email = `${who}@dash.test`;
    ids[who] = await createUser(h, {
      email,
      name: who,
      userType: a.userType,
      ...(a.role ? { role: a.role } : {}),
      departmentId: a.dept ?? null,
    });
    cookies[who] = await signInCookie(h, email);
  }
  // A suspended CSE student counts nowhere.
  await createUser(h, {
    email: 'gone@dash.test',
    userType: 'student',
    departmentId: cse,
    isActive: false,
  });

  // Terms and seats (faked roles above, real rows here).
  const year = Number(today.slice(0, 4));
  await prisma.clubCommitteeMember.create({
    data: {
      userId: ids.moderator,
      clubId: cseClub,
      position: 'President',
      termStartYear: year,
      termEndYear: year,
    },
  });
  await prisma.departmentAdminTerm.create({
    data: {
      userId: ids.cse_admin,
      departmentId: cse,
      startDate: toDbDate(addDays(today, -30)),
      endDate: toDbDate(addDays(today, 45)),
      isCurrent: true,
    },
  });

  // Events: a CSE public upcoming one, an ECE members-only one (invisible to CSE), a CSE
  // draft, and a CSE event this month (completed) for the dept admin's month count.
  ev.cseUpcoming = await event(cseClub, ids.cse_admin, [cse], {
    status: 'published',
    start: nextMonth,
    title: 'CSE Fair',
  });
  ev.eceMembersOnly = await event(eceClub, ids.ece_admin, [ece], {
    status: 'published',
    start: nextMonth,
    visibility: 'members_only',
    title: 'ECE Members Night',
  });
  ev.cseDraft = await event(cseClub, ids.moderator, [cse], {
    status: 'draft',
    start: nextMonth,
    title: 'CSE Draft',
  });
  ev.cseThisMonth = await event(cseClub, ids.cse_admin, [cse], {
    status: 'completed',
    start: new Date(month.from.getTime() + 3_600_000),
    title: 'CSE Month Talk',
  });
  await prisma.eventRegistration.create({
    data: { userId: ids.student, eventId: ev.cseUpcoming, status: 'registered' },
  });
  await prisma.eventRegistration.create({
    data: { userId: ids.faculty, eventId: ev.cseUpcoming, status: 'cancelled' },
  });

  // Memberships and payments: revenue counts completed only.
  await membership(ids.student, cseClub, '1500.50', 'completed');
  await membership(ids.ece_student, eceClub, '200.25', 'completed');
  const lapsed = await prisma.clubMembership.create({
    data: {
      userId: ids.faculty,
      clubId: cseClub,
      type: 'monthly',
      status: 'cancelled',
      startDate: toDbDate(addDays(today, -40)),
      endDate: toDbDate(addDays(today, -10)),
    },
  });
  await prisma.paymentTransaction.create({
    data: {
      userId: ids.faculty,
      clubMembershipId: lapsed.id,
      amount: '999.00',
      transactionId: 'TX-failed',
      paymentStatus: 'failed',
    },
  });

  // Announcements: one CSE department post, one ECE post.
  await prisma.announcement.create({
    data: { title: 'CSE news', content: 'x', departmentId: cse, authorId: ids.cse_admin },
  });
  await prisma.announcement.create({
    data: { title: 'ECE news', content: 'x', departmentId: ece, authorId: ids.ece_admin },
  });

  // Blood: requests for A+ (everyone's group) from ECE and from the student, a B- one, a
  // fulfilled one; an unverified donation in each department.
  await bloodRequest(ids.ece_student, 'A+');
  await bloodRequest(ids.student, 'A+');
  await bloodRequest(ids.ece_student, 'B-');
  await bloodRequest(ids.ece_student, 'O+', 'fulfilled');
  for (const userId of [ids.student, ids.ece_student]) {
    await prisma.bloodDonation.create({
      data: { userId, bloodGroup: 'A+', donationDate: toDbDate(today) },
    });
  }

  // Audit rows at chosen times (the sign-ins above wrote LOGIN rows too).
  const at = (iso: string) => new Date(iso);
  await prisma.auditLog.createMany({
    data: [
      {
        userId: ids.super_admin,
        action: AUDIT_ACTIONS.ROLE_CHANGED,
        entityType: 'user',
        entityId: ids.moderator,
        createdAt: at('2026-01-10T17:59:00Z'),
      },
      {
        userId: ids.super_admin,
        action: AUDIT_ACTIONS.ROLE_CHANGED,
        entityType: 'user',
        entityId: ids.cse_admin,
        createdAt: at('2026-01-10T18:00:00Z'),
      },
      {
        userId: null,
        action: AUDIT_ACTIONS.MEMBERSHIP_EXPIRED,
        entityType: 'club_membership',
        entityId: '1',
        createdAt: at('2026-01-09T10:00:00Z'),
      },
    ],
  });
});

describe('GET /dashboard/student, the personal view (FR-DASH-001, D13)', () => {
  it('gives a student visible events, their membership, D15 announcements and matching requests', async () => {
    const res = await get('student', '/api/v1/dashboard/student');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.upcoming_events.map((e: { id: number }) => e.id)).toEqual([ev.cseUpcoming]);
    expect(d.membership.current).toMatchObject({ status: 'active', club: { id: cseClub } });
    expect(d.membership.scheduled).toBeNull();
    expect(d.membership.days_left).toBe(20);
    expect(d.announcements.map((a: { title: string }) => a.title)).toEqual(['CSE news']);
    // A+ from ECE only: their own A+ request and the B- one are left out.
    expect(d.blood_requests).toHaveLength(1);
    expect(d.blood_requests[0]).toMatchObject({
      blood_group: 'A+',
      requester: { id: ids.ece_student },
    });
    expect(d.chatbot).toEqual({ enabled: false });
    expect(JSON.stringify(res.body)).not.toMatch(/@dash\.test/);
  });

  it('gives faculty the personal view without a membership block', async () => {
    const res = await get('faculty', '/api/v1/dashboard/student');
    expect(res.status).toBe(200);
    expect(res.body.data.membership).toBeNull();
    expect(res.body.data.upcoming_events.map((e: { id: number }) => e.id)).toEqual([
      ev.cseUpcoming,
    ]);
  });

  it('keeps the personal view for a moderator and a dept admin (D13)', async () => {
    expect((await get('moderator', '/api/v1/dashboard/student')).status).toBe(200);
    expect((await get('cse_admin', '/api/v1/dashboard/student')).status).toBe(200);
  });

  it('refuses a super admin with 403', async () => {
    expect((await get('super_admin', '/api/v1/dashboard/student')).status).toBe(403);
  });
});

describe('GET /dashboard/moderator (FR-DASH-002)', () => {
  it('summarises the seat club', async () => {
    const res = await get('moderator', '/api/v1/dashboard/moderator');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.club).toEqual({ id: cseClub, name: 'CSE Club' });
    expect(d.stats).toEqual({ upcoming_events: 1, upcoming_registrations: 1, active_members: 1 });
    expect(d.drafts.map((e: { id: number }) => e.id)).toEqual([ev.cseDraft]);
    expect(d.recent_registrations).toHaveLength(1);
    expect(d.recent_registrations[0]).toMatchObject({
      status: 'registered',
      user: { id: ids.student, name: 'student' },
      event: { id: ev.cseUpcoming, title: 'CSE Fair' },
    });
    expect(d.committee.map((c: { user: { id: string } }) => c.user.id)).toEqual([ids.moderator]);
    expect(JSON.stringify(res.body)).not.toMatch(/@dash\.test|phone/);
  });

  it('answers 404 NO_COMMITTEE_SEAT for a moderator without a current seat', async () => {
    const res = await get('stale_mod', '/api/v1/dashboard/moderator');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_COMMITTEE_SEAT');
  });
});

describe('GET /dashboard/dept-admin (FR-DASH-003)', () => {
  it('counts only the CSE department', async () => {
    const res = await get('cse_admin', '/api/v1/dashboard/dept-admin');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.department).toEqual({ id: cse, name: 'CSE' });
    // Active CSE users: student, faculty, two moderators, the admin (the suspended one isn't).
    expect(d.users_by_role).toEqual({
      student: 1,
      faculty: 1,
      moderator: 2,
      dept_admin: 1,
      super_admin: 0,
    });
    expect(d.events_this_month).toEqual({
      total: 1,
      by_status: { draft: 0, published: 0, cancelled: 0, completed: 1 },
    });
    expect(d.pending_blood_verifications).toBe(1);
    expect(d.active_memberships).toBe(1);
    expect(d.announcements_this_month).toBe(1);
    expect(d.committee.vacant).toBe(false);
    expect(d.committee.current).toHaveLength(1);
    expect(d.admin_term).toMatchObject({
      start_date: addDays(today, -30),
      end_date: addDays(today, 45),
      days_left: 45,
    });
  });

  it('gives the ECE admin ECE figures and no CSE rows', async () => {
    const d = (await get('ece_admin', '/api/v1/dashboard/dept-admin')).body.data;
    expect(d.department.name).toBe('ECE');
    expect(d.users_by_role).toMatchObject({ student: 1, dept_admin: 1, moderator: 0 });
    expect(d.pending_blood_verifications).toBe(1);
    expect(d.committee).toEqual({ vacant: true, current: [] });
    expect(d.admin_term).toBeNull();
  });
});

describe('GET /dashboard/super-admin (FR-DASH-004)', () => {
  it('returns global totals, exact revenue, the last 10 audit rows and health', async () => {
    const res = await get('super_admin', '/api/v1/dashboard/super-admin');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.users_by_role).toEqual({
      student: 2,
      faculty: 1,
      moderator: 2,
      dept_admin: 2,
      super_admin: 1,
    });
    expect(d.users_by_department).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: cse, name: 'CSE', count: 5 }),
        expect.objectContaining({ id: ece, name: 'ECE', count: 2 }),
      ]),
    );
    expect(d.events_by_status).toEqual({ draft: 1, published: 2, cancelled: 0, completed: 1 });
    expect(d.active_memberships).toBe(2);
    expect(d.revenue).toEqual({ amount: '1700.75', currency: 'BDT' });
    expect(d.fulfilled_blood_requests).toBe(1);
    expect(d.recent_audit).toHaveLength(10);
    expect(d.dept_admin_terms).toEqual([
      expect.objectContaining({
        user: { id: ids.cse_admin, name: 'cse_admin' },
        department: { id: cse, name: 'CSE' },
      }),
    ]);
    expect(d.health.db).toBe('ok');
    expect(d.health.queues.map((q: { name: string }) => q.name)).toEqual([
      'email',
      'memberships',
      'terms',
      'events',
      'blood',
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/@dash\.test/);
  });

  it('still answers 200 with every queue unavailable when Redis is down', async () => {
    queueHealthState.down = true;
    try {
      const res = await get('super_admin', '/api/v1/dashboard/super-admin');
      expect(res.status).toBe(200);
      expect(res.body.data.health.queues).toHaveLength(5);
      for (const q of res.body.data.health.queues) {
        expect(q).toMatchObject({ state: 'unavailable', counts: null });
      }
      expect(res.body.data.users_by_role.super_admin).toBe(1);
    } finally {
      queueHealthState.down = false;
    }
  });
});

describe('GET /admin/audit-logs (FR-AUDIT-002)', () => {
  const logs = (query: string) => get('super_admin', `/api/v1/admin/audit-logs${query}`);

  it('lists newest first with the actor by name and role, and pages', async () => {
    const first = await logs('?limit=2');
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta).toMatchObject({ page: 1, limit: 2 });
    const all = (await logs('?limit=100')).body.data as { id: number; created_at: string }[];
    const times = all.map((r) => r.created_at);
    expect([...times].sort().reverse()).toEqual(times);
    expect(JSON.stringify(all)).not.toMatch(/@dash\.test/);
    const second = await logs('?limit=2&page=2');
    expect(second.body.data[0].id).toBe(all[2]!.id);
  });

  it('filters by action, entity type and user; a system actor is null', async () => {
    const role = (await logs(`?action=${AUDIT_ACTIONS.ROLE_CHANGED}`)).body.data;
    expect(role).toHaveLength(2);
    expect(role[0].actor).toEqual({
      id: ids.super_admin,
      name: 'super_admin',
      role: 'super_admin',
    });
    const sys = (await logs('?entity_type=club_membership')).body.data;
    expect(sys).toHaveLength(1);
    expect(sys[0].actor).toBeNull();
    const byUser = (await logs(`?user_id=${ids.super_admin}&action=${AUDIT_ACTIONS.ROLE_CHANGED}`))
      .body.data;
    expect(byUser).toHaveLength(2);
  });

  it('treats from/to as Dhaka days: 23:59 on the 10th is in to=2026-01-10, 00:00 on the 11th is not', async () => {
    // 2026-01-10T17:59Z is 23:59 Dhaka on the 10th; 18:00Z is 00:00 Dhaka on the 11th.
    const tenth = (
      await logs(`?action=${AUDIT_ACTIONS.ROLE_CHANGED}&from=2026-01-10&to=2026-01-10`)
    ).body.data;
    expect(tenth.map((r: { entity_id: string }) => r.entity_id)).toEqual([ids.moderator]);
    const eleventh = (
      await logs(`?action=${AUDIT_ACTIONS.ROLE_CHANGED}&from=2026-01-11&to=2026-01-11`)
    ).body.data;
    expect(eleventh.map((r: { entity_id: string }) => r.entity_id)).toEqual([ids.cse_admin]);
  });

  it('refuses everyone but a super admin, and bad queries', async () => {
    for (const who of ['student', 'cse_admin', 'moderator'] as const) {
      expect((await get(who, '/api/v1/admin/audit-logs')).status).toBe(403);
    }
    expect((await logs('?action=NOPE')).status).toBe(400);
  });
});
