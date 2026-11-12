import {
  ORIGIN,
  clubFor,
  createUser,
  departmentId,
  loadHarness,
  resetDatabase,
  sentEmails,
  signInCookie,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

// Event registrations (PRD FR-EVENT-007–011; PRD #7, #16; DECISIONS D36) against the real
// database, including the hard cap under parallel requests.

// These suites make many requests per test (and the overbooking race signs in ten users);
// a cold or distant Neon branch pushes them past the 30 s default.
jest.setTimeout(180_000);

const h = await loadHarness();
const { app, prisma } = h;
const { toDbDate, todayInDhaka, addDays } = await import('../../src/lib/dates.js');

type Who =
  'student' | 'member' | 'faculty' | 'moderator' | 'dept_admin' | 'super_admin' | 'ece_admin';
const ids = {} as Record<Who, string>;
const cookies = {} as Record<Who, string>;
let cse: number;
let ece: number;
let cseClub: number;

const DAY = 24 * 60 * 60 * 1000;
const at = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3600_000);

const send = (cookie: string, method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
  request(app)[method](path).set('Origin', ORIGIN).set('Cookie', cookie);
const as = (who: Who) => ({
  get: (path: string) => send(cookies[who], 'get', path),
  post: (path: string, body?: object) => send(cookies[who], 'post', path).send(body ?? {}),
  patch: (path: string) => send(cookies[who], 'patch', path),
  delete: (path: string) => send(cookies[who], 'delete', path),
});

async function published(overrides: Record<string, unknown> = {}) {
  const res = await as('dept_admin').post('/api/v1/events', {
    title: 'Career fair',
    organizer_club_id: cseClub,
    start_date: at(10).toISOString(),
    end_date: at(10, 6).toISOString(),
    department_ids: [cse],
    ...overrides,
  });
  if (res.status !== 201) throw new Error(`create failed: ${JSON.stringify(res.body)}`);
  const id = res.body.data.id as number;
  await as('dept_admin').patch(`/api/v1/events/${id}/publish`);
  return id;
}

const setTimes = (id: number, start: Date, end: Date) =>
  prisma.event.update({ where: { id }, data: { startDate: start, endDate: end } });

const register = (who: Who, id: number) => as(who).post(`/api/v1/events/${id}/register`);

beforeAll(async () => {
  await resetDatabase(h);
  cse = await departmentId(h, 'CSE');
  ece = await departmentId(h, 'ECE');
  cseClub = await clubFor(h, 'CSE');
  const people: [Who, 'student' | 'faculty' | 'super_admin', string, number][] = [
    ['student', 'student', 'student', cse],
    ['member', 'student', 'student', cse],
    ['faculty', 'faculty', 'faculty', cse],
    ['moderator', 'student', 'moderator', cse],
    ['dept_admin', 'faculty', 'dept_admin', cse],
    ['super_admin', 'super_admin', 'super_admin', cse],
    ['ece_admin', 'faculty', 'dept_admin', ece],
  ];
  for (const [who, userType, role, dept] of people) {
    ids[who] = await createUser(h, {
      email: `${who}@regs.test`,
      name: `${who} person`,
      userType,
      role,
      departmentId: dept,
      studentId: userType === 'student' ? `CSE-${who}` : undefined,
    });
    cookies[who] = await signInCookie(h, `${who}@regs.test`);
  }
  const year = Number(todayInDhaka().slice(0, 4));
  await prisma.clubCommitteeMember.create({
    data: {
      clubId: cseClub,
      userId: ids.moderator,
      position: 'Treasurer',
      termStartYear: year,
      termEndYear: year + 1,
    },
  });
  const today = todayInDhaka();
  await prisma.clubMembership.create({
    data: {
      userId: ids.member,
      clubId: cseClub,
      type: 'monthly',
      status: 'active',
      startDate: toDbDate(addDays(today, -5)),
      endDate: toDbDate(addDays(today, 25)),
    },
  });
});

beforeEach(() => {
  sentEmails.length = 0;
});

describe('POST /events/:id/register (FR-EVENT-007)', () => {
  it('registers, confirms by email, and shows on the detail', async () => {
    const id = await published({ venue: 'Hall 1' });
    const res = await register('student', id);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'registered', event: { id } });
    expect(sentEmails).toEqual([
      expect.objectContaining({
        kind: 'event-registered',
        to: 'student@regs.test',
        venue: 'Hall 1',
      }),
    ]);
    const detail = await as('student').get(`/api/v1/events/${id}`);
    expect(detail.body.data).toMatchObject({
      registered_count: 1,
      my_registration: { status: 'registered' },
      can_register: false,
      register_blocked_reason: 'already_registered',
    });
  });

  it('409s a second registration and refuses super_admin', async () => {
    const id = await published();
    await register('faculty', id);
    const again = await register('faculty', id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_REGISTERED');
    expect((await register('super_admin', id)).status).toBe(403);
  });

  it('reactivates a cancelled row instead of inserting another', async () => {
    const id = await published();
    const first = await register('student', id);
    await as('student').delete(`/api/v1/events/${id}/register`);
    const back = await register('student', id);
    expect(back.status).toBe(200);
    expect(back.body.data.id).toBe(first.body.data.id);
    expect(back.body.data.cancelled_at).toBeNull();
    expect(await prisma.eventRegistration.count({ where: { eventId: id } })).toBe(1);
  });

  it('refuses drafts, ended and cancelled events', async () => {
    const draft = await as('dept_admin').post('/api/v1/events', {
      title: 'Draft',
      organizer_club_id: cseClub,
      start_date: at(5).toISOString(),
      end_date: at(5, 2).toISOString(),
      department_ids: [cse],
    });
    // Drafts are invisible to students: 404, not a hint that the event exists.
    expect((await register('student', draft.body.data.id)).status).toBe(404);

    const ended = await published();
    await setTimes(ended, at(-2), at(-1));
    const res = await register('student', ended);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_NOT_OPEN');

    // Running events stay open until they end (FR-EVENT-007 check 1).
    const running = await published();
    await setTimes(running, at(-1), at(1));
    expect((await register('student', running)).status).toBe(201);

    const cancelled = await published();
    await as('dept_admin').patch(`/api/v1/events/${cancelled}/cancel`);
    expect((await register('student', cancelled)).body.error.code).toBe('EVENT_NOT_OPEN');
  });

  it('applies the members-only rule (PRD #7)', async () => {
    const id = await published({ visibility: 'members_only' });
    // Not visible without a membership, so 404.
    expect((await register('student', id)).status).toBe(404);
    expect((await register('member', id)).status).toBe(201);
    // Organizers see it but must still qualify to register.
    const mod = await register('moderator', id);
    expect(mod.status).toBe(403);
    expect(mod.body.error.code).toBe('NOT_ELIGIBLE');
  });

  it('answers 409 EVENT_FULL at the cap', async () => {
    const id = await published({ max_attendees: 1 });
    await register('student', id);
    const res = await register('faculty', id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_FULL');
    // A cancellation frees the seat.
    await as('student').delete(`/api/v1/events/${id}/register`);
    expect((await register('faculty', id)).status).toBe(201);
  });

  it('never overbooks under parallel registrations (PRD #16)', async () => {
    const id = await published({ max_attendees: 3 });
    const crowd: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const email = `crowd${i}@regs.test`;
      await createUser(h, { email, userType: 'student', departmentId: cse });
      crowd.push(await signInCookie(h, email));
    }
    const results = await Promise.all(
      crowd.map((cookie) => send(cookie, 'post', `/api/v1/events/${id}/register`)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(r.body.error.code).toBe('EVENT_FULL');
    }
    expect(
      await prisma.eventRegistration.count({
        where: { eventId: id, status: { in: ['registered', 'attended'] } },
      }),
    ).toBe(3);
  });

  it('keeps one row for one user’s parallel double submits', async () => {
    const id = await published();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        send(cookies.faculty, 'post', `/api/v1/events/${id}/register`),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.eventRegistration.count({ where: { eventId: id } })).toBe(1);
  });
});

describe('DELETE /events/:id/register (FR-EVENT-008)', () => {
  it('cancels before the start, and 404s without a registration', async () => {
    const id = await published();
    expect((await as('student').delete(`/api/v1/events/${id}/register`)).status).toBe(404);
    await register('student', id);
    const res = await as('student').delete(`/api/v1/events/${id}/register`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelled_at).not.toBeNull();
    expect((await as('student').delete(`/api/v1/events/${id}/register`)).status).toBe(404);
  });

  it('409s once the event has started', async () => {
    const id = await published();
    await register('student', id);
    await setTimes(id, at(-1), at(1));
    const res = await as('student').delete(`/api/v1/events/${id}/register`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_ALREADY_STARTED');
  });

  it('refuses super_admin', async () => {
    const id = await published();
    expect((await as('super_admin').delete(`/api/v1/events/${id}/register`)).status).toBe(403);
  });
});

describe('GET /events/my-registrations (FR-EVENT-009)', () => {
  it('lists only the caller’s rows, split by upcoming and past', async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE events RESTART IDENTITY CASCADE');
    const soon = await published({ title: 'Soon' });
    const later = await published({
      title: 'Later',
      start_date: at(20).toISOString(),
      end_date: at(20, 2).toISOString(),
    });
    const old = await published({ title: 'Old' });
    await register('student', soon);
    await register('student', later);
    await register('student', old);
    await register('faculty', soon);
    await setTimes(old, at(-3), at(-2));

    const all = await as('student').get('/api/v1/events/my-registrations');
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(3);
    const upcoming = await as('student').get('/api/v1/events/my-registrations?when=upcoming');
    expect(upcoming.body.data.map((r: { event: { title: string } }) => r.event.title)).toEqual([
      'Soon',
      'Later',
    ]);
    const past = await as('student').get('/api/v1/events/my-registrations?when=past');
    expect(past.body.data.map((r: { event: { title: string } }) => r.event.title)).toEqual(['Old']);
    expect((await as('student').get('/api/v1/events/my-registrations?x=1')).status).toBe(400);
  });
});

describe('GET /events/:id/registrations (FR-EVENT-011)', () => {
  it('lists registrants for organizers without email, as JSON or CSV', async () => {
    const id = await published();
    await register('student', id);
    await register('faculty', id);

    const res = await as('moderator').get(`/api/v1/events/${id}/registrations`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data[0]).toMatchObject({
      status: 'registered',
      user: { name: 'student person', student_id: 'CSE-student', department: { name: 'CSE' } },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/@regs\.test|email|phone/);

    const csv = await as('dept_admin').get(`/api/v1/events/${id}/registrations?format=csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/^text\/csv/);
    expect(csv.headers['content-disposition']).toContain(`event-${id}-registrations.csv`);
    const lines = csv.text.trim().split('\r\n');
    expect(lines[0]).toBe(
      'registration_id,name,student_id,department,status,registered_at,checked_in_at',
    );
    expect(lines).toHaveLength(3);
    expect(csv.text).not.toMatch(/@regs\.test/);
  });

  it('filters by status and refuses non-organizers', async () => {
    const id = await published();
    await register('student', id);
    await register('faculty', id);
    await as('faculty').delete(`/api/v1/events/${id}/register`);
    const res = await as('dept_admin').get(`/api/v1/events/${id}/registrations?status=cancelled`);
    expect(res.body.data).toHaveLength(1);
    expect((await as('ece_admin').get(`/api/v1/events/${id}/registrations`)).status).toBe(403);
    expect((await as('student').get(`/api/v1/events/${id}/registrations`)).status).toBe(403);
  });
});

describe('PATCH /events/:id/registrations/:regId/check-in (FR-EVENT-010)', () => {
  it('checks in once, audits it, and refuses the rest', async () => {
    const id = await published();
    const reg = (await register('student', id)).body.data.id as number;
    const res = await as('moderator').patch(`/api/v1/events/${id}/registrations/${reg}/check-in`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('attended');
    expect(res.body.data.checked_in_at).not.toBeNull();
    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.EVENT_CHECK_IN, entityId: String(reg) },
    });
    expect(audit?.userId).toBe(ids.moderator);

    const again = await as('moderator').patch(`/api/v1/events/${id}/registrations/${reg}/check-in`);
    expect(again.body.error.code).toBe('ALREADY_CHECKED_IN');
    // Attended can't be cancelled.
    expect((await as('student').delete(`/api/v1/events/${id}/register`)).status).toBe(409);
  });

  it('refuses cancelled rows, rows of another event, and other departments', async () => {
    const id = await published();
    const other = await published();
    const reg = (await register('faculty', id)).body.data.id as number;
    const wrong = await as('dept_admin').patch(
      `/api/v1/events/${other}/registrations/${reg}/check-in`,
    );
    expect(wrong.status).toBe(404);
    expect(
      (await as('ece_admin').patch(`/api/v1/events/${id}/registrations/${reg}/check-in`)).status,
    ).toBe(403);
    await as('faculty').delete(`/api/v1/events/${id}/register`);
    const cancelled = await as('dept_admin').patch(
      `/api/v1/events/${id}/registrations/${reg}/check-in`,
    );
    expect(cancelled.body.error.code).toBe('REGISTRATION_NOT_ACTIVE');
  });

  it('needs a published event', async () => {
    const id = await published();
    const reg = (await register('student', id)).body.data.id as number;
    await as('dept_admin').patch(`/api/v1/events/${id}/cancel`);
    const res = await as('dept_admin').patch(`/api/v1/events/${id}/registrations/${reg}/check-in`);
    expect(res.body.error.code).toBe('EVENT_NOT_PUBLISHED');
  });

  it('404s an unknown registration', async () => {
    const id = await published();
    expect(
      (await as('dept_admin').patch(`/api/v1/events/${id}/registrations/999999/check-in`)).status,
    ).toBe(404);
  });
});
