import {
  ORIGIN,
  clubFor,
  createUser,
  departmentId,
  eventJobs,
  loadHarness,
  resetDatabase,
  signInCookie,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

// /api/v1/events, organizer side and browse (PRD FR-EVENT-001–006, -012; PRD #3, #7;
// DECISIONS D36) against the real database. Cloudinary is mocked at its client module.

const uploadEventPoster = jest.fn<(eventId: number, buffer: Buffer) => Promise<string>>();
jest.unstable_mockModule('../../src/lib/cloudinary.js', () => ({
  uploadAvatar: jest.fn(),
  uploadClubLogo: jest.fn(),
  uploadEventPoster,
}));

// These suites make many requests per test (and the overbooking race signs in ten users);
// a cold or distant Neon branch pushes them past the 30 s default.
jest.setTimeout(180_000);

const h = await loadHarness();
const { app, prisma } = h;
const { toDbDate, todayInDhaka, addDays } = await import('../../src/lib/dates.js');
const { fanOutEventEmails } = await import('../../src/modules/events/event.notify.js');
const { sentEmails } = await import('./harness.js');

const POSTER_URL = 'https://res.cloudinary.com/demo/image/upload/v1/uniconnect/event-posters/e.png';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);

type Who =
  | 'student'
  | 'member'
  | 'faculty'
  | 'moderator'
  | 'dept_admin'
  | 'super_admin'
  | 'ece_admin'
  | 'ece_member'
  | 'ece_moderator'
  | 'bba_member';

const ids = {} as Record<Who, string>;
const cookies = {} as Record<Who, string>;
let cse: number;
let ece: number;
let bba: number;
let cseClub: number;
let eceClub: number;
let bbaClub: number;

const DAY = 24 * 60 * 60 * 1000;
const at = (days: number, hours = 0) => new Date(Date.now() + days * DAY + hours * 3600_000);

const as = (who: Who) => ({
  get: (path: string) => request(app).get(path).set('Origin', ORIGIN).set('Cookie', cookies[who]),
  post: (path: string, body?: object) =>
    request(app)
      .post(path)
      .set('Origin', ORIGIN)
      .set('Cookie', cookies[who])
      .send(body ?? {}),
  patch: (path: string, body?: object) =>
    request(app)
      .patch(path)
      .set('Origin', ORIGIN)
      .set('Cookie', cookies[who])
      .send(body ?? {}),
});

const eventBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'Spring Hackathon',
  description: 'Build things for a day.',
  organizer_club_id: cseClub,
  visibility: 'public',
  start_date: at(10).toISOString(),
  end_date: at(10, 6).toISOString(),
  venue: 'Hall 2',
  department_ids: [cse],
  ...overrides,
});

async function createEvent(who: Who = 'dept_admin', overrides: Record<string, unknown> = {}) {
  const res = await as(who).post('/api/v1/events', eventBody(overrides));
  if (res.status !== 201)
    throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.id as number;
}

async function published(overrides: Record<string, unknown> = {}, who: Who = 'dept_admin') {
  const id = await createEvent(who, overrides);
  const res = await as(who).patch(`/api/v1/events/${id}/publish`);
  if (res.status !== 200) throw new Error(`publish failed: ${res.status}`);
  return id;
}

/** Moves an event's times straight in the database (to test past and running events). */
const setTimes = (id: number, start: Date, end: Date) =>
  prisma.event.update({ where: { id }, data: { startDate: start, endDate: end } });

async function activeMembership(userId: string, clubId: number, endOffsetDays = 20) {
  const today = todayInDhaka();
  await prisma.clubMembership.create({
    data: {
      userId,
      clubId,
      type: 'monthly',
      status: 'active',
      startDate: toDbDate(addDays(today, -10)),
      endDate: toDbDate(addDays(today, endOffsetDays)),
    },
  });
}

const listIds = async (who: Who, query = '') =>
  ((await as(who).get(`/api/v1/events${query}`)).body.data as { id: number }[]).map((e) => e.id);

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
    ['faculty', 'faculty', 'faculty', cse],
    ['moderator', 'student', 'moderator', cse],
    ['dept_admin', 'faculty', 'dept_admin', cse],
    ['super_admin', 'super_admin', 'super_admin', cse],
    ['ece_admin', 'faculty', 'dept_admin', ece],
    ['ece_member', 'student', 'student', ece],
    ['ece_moderator', 'student', 'moderator', ece],
    ['bba_member', 'student', 'student', bba],
  ];
  for (const [who, userType, role, dept] of people) {
    ids[who] = await createUser(h, {
      email: `${who}@events.test`,
      name: who,
      userType,
      role,
      departmentId: dept,
    });
    cookies[who] = await signInCookie(h, `${who}@events.test`);
  }
  // Real seats, since the service checks them (PRD #3), not just the role.
  const year = Number(todayInDhaka().slice(0, 4));
  for (const [who, clubId] of [
    ['moderator', cseClub],
    ['ece_moderator', eceClub],
  ] as const) {
    await prisma.clubCommitteeMember.create({
      data: {
        clubId,
        userId: ids[who],
        position: 'President',
        termStartYear: year,
        termEndYear: year + 1,
      },
    });
  }
  await activeMembership(ids.member, cseClub);
  await activeMembership(ids.ece_member, eceClub);
  await activeMembership(ids.bba_member, bbaClub);
});

beforeEach(() => {
  eventJobs.length = 0;
  uploadEventPoster.mockReset();
  uploadEventPoster.mockResolvedValue(POSTER_URL);
});

describe('POST /events (FR-EVENT-001)', () => {
  it('creates a draft, adds the organizer department and audits it', async () => {
    const res = await as('dept_admin').post(
      '/api/v1/events',
      eventBody({ department_ids: [ece], max_attendees: 50 }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'Spring Hackathon',
      status: 'draft',
      visibility: 'public',
      is_paid: false,
      fee_amount: null,
      max_attendees: 50,
      organizer_club: { id: cseClub, name: 'CSE Club' },
      can_manage: true,
      registered_count: 0,
    });
    expect(res.body.data.departments.map((d: { name: string }) => d.name)).toEqual(['CSE', 'ECE']);
    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.EVENT_CREATED, entityId: String(res.body.data.id) },
    });
    expect(audit?.userId).toBe(ids.dept_admin);
  });

  it('stores a paid event fee as a decimal string', async () => {
    const res = await as('super_admin').post(
      '/api/v1/events',
      eventBody({ is_paid: true, fee_amount: '200' }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.fee_amount).toBe('200.00');
  });

  it('lets a moderator create for their own committee club only (PRD #3)', async () => {
    expect((await as('moderator').post('/api/v1/events', eventBody())).status).toBe(201);
    const other = await as('moderator').post(
      '/api/v1/events',
      eventBody({ organizer_club_id: eceClub }),
    );
    expect(other.status).toBe(403);
  });

  it('refuses another department’s dept_admin', async () => {
    expect((await as('ece_admin').post('/api/v1/events', eventBody())).status).toBe(403);
  });

  it('refuses students and faculty', async () => {
    expect((await as('student').post('/api/v1/events', eventBody())).status).toBe(403);
    expect((await as('faculty').post('/api/v1/events', eventBody())).status).toBe(403);
  });

  it('answers 401 without a session', async () => {
    const res = await request(app).post('/api/v1/events').set('Origin', ORIGIN).send(eventBody());
    expect(res.status).toBe(401);
  });

  it('400s a bad body, an unknown key, a past start and an unknown department', async () => {
    const bad = await as('dept_admin').post('/api/v1/events', eventBody({ title: '' }));
    expect(bad.status).toBe(400);
    const unknown = await as('dept_admin').post(
      '/api/v1/events',
      eventBody({ poster_image_url: 'https://x' }),
    );
    expect(unknown.status).toBe(400);
    const past = await as('dept_admin').post(
      '/api/v1/events',
      eventBody({ start_date: at(-1).toISOString(), end_date: at(1).toISOString() }),
    );
    expect(past.status).toBe(400);
    expect(past.body.error.details[0].path).toBe('start_date');
    const dept = await as('dept_admin').post(
      '/api/v1/events',
      eventBody({ department_ids: [999999] }),
    );
    expect(dept.status).toBe(400);
    expect(dept.body.error.code).toBe('UNKNOWN_DEPARTMENT');
  });

  it('404s an unknown club', async () => {
    const res = await as('super_admin').post(
      '/api/v1/events',
      eventBody({ organizer_club_id: 999999 }),
    );
    expect(res.status).toBe(404);
  });
});

describe('PATCH /events/:id (FR-EVENT-004)', () => {
  it('edits a draft, audits changed fields only, and writes nothing for a no-op', async () => {
    const id = await createEvent();
    const res = await as('dept_admin').patch(`/api/v1/events/${id}`, {
      title: 'Autumn Hackathon',
      venue: null,
      department_ids: [cse, bba],
    });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Autumn Hackathon');
    expect(res.body.data.venue).toBeNull();
    expect(res.body.data.departments.map((d: { name: string }) => d.name)).toEqual(['BBA', 'CSE']);
    const audits = await prisma.auditLog.findMany({
      where: { action: AUDIT_ACTIONS.EVENT_UPDATED, entityId: String(id) },
    });
    expect(audits).toHaveLength(1);
    expect(Object.keys(audits[0]!.newValue as object).sort()).toEqual([
      'department_ids',
      'title',
      'venue',
    ]);

    await as('dept_admin').patch(`/api/v1/events/${id}`, { title: 'Autumn Hackathon' });
    expect(
      await prisma.auditLog.count({
        where: { action: AUDIT_ACTIONS.EVENT_UPDATED, entityId: String(id) },
      }),
    ).toBe(1);
  });

  it('locks dates, visibility and departments after publish', async () => {
    const id = await published();
    const res = await as('dept_admin').patch(`/api/v1/events/${id}`, {
      start_date: at(11).toISOString(),
      visibility: 'members_only',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_FIELD_LOCKED');
    expect(res.body.error.details.fields).toEqual(['start_date', 'visibility']);
    expect((await as('dept_admin').patch(`/api/v1/events/${id}`, { venue: 'Hall 3' })).status).toBe(
      200,
    );
  });

  it('checks the date order against the stored row and the fee rule', async () => {
    const id = await createEvent();
    const order = await as('dept_admin').patch(`/api/v1/events/${id}`, {
      end_date: at(9).toISOString(),
    });
    expect(order.status).toBe(400);
    const fee = await as('dept_admin').patch(`/api/v1/events/${id}`, { is_paid: true });
    expect(fee.status).toBe(400);
    const paid = await as('dept_admin').patch(`/api/v1/events/${id}`, {
      is_paid: true,
      fee_amount: 50,
    });
    expect(paid.body.data.fee_amount).toBe('50.00');
    const free = await as('dept_admin').patch(`/api/v1/events/${id}`, { is_paid: false });
    expect(free.body.data.fee_amount).toBeNull();
  });

  it('refuses capacity below the seats taken', async () => {
    const id = await published({ max_attendees: 5 });
    await as('student').post(`/api/v1/events/${id}/register`);
    await as('member').post(`/api/v1/events/${id}/register`);
    const res = await as('dept_admin').patch(`/api/v1/events/${id}`, { max_attendees: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAPACITY_BELOW_REGISTRATIONS');
    expect(
      (await as('dept_admin').patch(`/api/v1/events/${id}`, { max_attendees: 2 })).status,
    ).toBe(200);
  });

  it('freezes cancelled and completed events', async () => {
    const id = await createEvent();
    await as('dept_admin').patch(`/api/v1/events/${id}/cancel`);
    const res = await as('dept_admin').patch(`/api/v1/events/${id}`, { title: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_NOT_EDITABLE');
  });

  it('403s a moderator of another club and 404s an event they can’t see', async () => {
    const id = await published();
    expect((await as('ece_moderator').patch(`/api/v1/events/${id}`, { title: 'x' })).status).toBe(
      403,
    );
    const draft = await createEvent();
    expect(
      (await as('ece_moderator').patch(`/api/v1/events/${draft}`, { title: 'x' })).status,
    ).toBe(404);
  });
});

describe('PATCH /events/:id/poster (FR-EVENT-002)', () => {
  it('uploads, saves the URL and audits it', async () => {
    const id = await createEvent();
    const res = await request(app)
      .patch(`/api/v1/events/${id}/poster`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookies.dept_admin)
      .attach('poster', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.data.poster_image_url).toBe(POSTER_URL);
    expect(uploadEventPoster).toHaveBeenCalledWith(id, expect.any(Buffer));
  });

  it('refuses a fake image before uploading, and a caller who can’t manage', async () => {
    const id = await createEvent();
    const fake = await request(app)
      .patch(`/api/v1/events/${id}/poster`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookies.dept_admin)
      .attach('poster', Buffer.from('not an image'), {
        filename: 'p.png',
        contentType: 'image/png',
      });
    expect(fake.status).toBe(400);
    const pub = await published();
    const other = await request(app)
      .patch(`/api/v1/events/${pub}/poster`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookies.ece_admin)
      .attach('poster', PNG, { filename: 'p.png', contentType: 'image/png' });
    expect(other.status).toBe(403);
    expect(uploadEventPoster).not.toHaveBeenCalled();
  });
});

describe('publish, cancel, complete (FR-EVENT-003, -005, -012)', () => {
  it('publishes a draft once, audits and queues the fan-out', async () => {
    const id = await createEvent();
    const res = await as('dept_admin').patch(`/api/v1/events/${id}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('published');
    expect(eventJobs).toEqual([{ eventId: id, kind: 'published' }]);
    expect(
      await prisma.auditLog.count({
        where: { action: AUDIT_ACTIONS.EVENT_PUBLISHED, entityId: String(id) },
      }),
    ).toBe(1);
    const again = await as('dept_admin').patch(`/api/v1/events/${id}/publish`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EVENT_NOT_DRAFT');
  });

  it('refuses to publish an event whose start has passed', async () => {
    const id = await createEvent();
    await setTimes(id, at(-1), at(1));
    const res = await as('dept_admin').patch(`/api/v1/events/${id}/publish`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVENT_ALREADY_STARTED');
  });

  it('cancels a published event and queues emails; a draft cancels quietly', async () => {
    const id = await published();
    eventJobs.length = 0;
    const res = await as('moderator').patch(`/api/v1/events/${id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(eventJobs).toEqual([{ eventId: id, kind: 'cancelled' }]);
    expect((await as('moderator').patch(`/api/v1/events/${id}/cancel`)).body.error.code).toBe(
      'EVENT_NOT_CANCELLABLE',
    );

    eventJobs.length = 0;
    const draft = await createEvent();
    expect((await as('dept_admin').patch(`/api/v1/events/${draft}/cancel`)).status).toBe(200);
    expect(eventJobs).toEqual([]);
  });

  it('completes only after the end and marks the rest no_show', async () => {
    const id = await published();
    await as('student').post(`/api/v1/events/${id}/register`);
    const memberReg = await as('member').post(`/api/v1/events/${id}/register`);

    const early = await as('dept_admin').patch(`/api/v1/events/${id}/complete`);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('EVENT_NOT_ENDED');

    await setTimes(id, at(-1), at(-1, 4));
    // The member came; the student didn't.
    await as('dept_admin').patch(
      `/api/v1/events/${id}/registrations/${memberReg.body.data.id}/check-in`,
    );
    const res = await as('dept_admin').patch(`/api/v1/events/${id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    const regs = await prisma.eventRegistration.findMany({
      where: { eventId: id },
      select: { userId: true, status: true },
    });
    expect(Object.fromEntries(regs.map((r) => [r.userId, r.status]))).toEqual({
      [ids.student]: 'no_show',
      [ids.member]: 'attended',
    });
    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTIONS.EVENT_COMPLETED, entityId: String(id) },
    });
    expect(audit?.newValue).toMatchObject({ status: 'completed', no_show_count: 1 });
  });

  it('refuses to complete a draft', async () => {
    const id = await createEvent();
    await setTimes(id, at(-2), at(-1));
    const res = await as('dept_admin').patch(`/api/v1/events/${id}/complete`);
    expect(res.body.error.code).toBe('EVENT_NOT_PUBLISHED');
  });
});

describe('browse and detail visibility (FR-EVENT-006, PRD #7)', () => {
  let draft: number;
  let pub: number;
  let membersOnly: number;
  let crossDept: number;
  let eceOnly: number;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE events RESTART IDENTITY CASCADE');
    draft = await createEvent('dept_admin', { title: 'Draft night' });
    pub = await published({ title: 'Public quiz' });
    membersOnly = await published({ title: 'Members dinner', visibility: 'members_only' });
    // CSE organizes, ECE listed too: ECE members with an ECE club membership qualify.
    crossDept = await published({
      title: 'Joint robotics',
      visibility: 'members_only',
      department_ids: [cse, ece],
    });
    eceOnly = await published(
      {
        title: 'ECE circuits',
        organizer_club_id: eceClub,
        visibility: 'members_only',
        department_ids: [ece],
      },
      'ece_admin',
    );
  });

  it('shows a student public events only, without a membership', async () => {
    expect(await listIds('student')).toEqual([pub]);
  });

  it('shows a member their department’s members-only events', async () => {
    expect((await listIds('member')).sort()).toEqual([pub, membersOnly, crossDept].sort());
  });

  it('needs the own department listed, not just a listed club membership', async () => {
    // ECE member: ECE is listed on crossDept and eceOnly only.
    expect((await listIds('ece_member')).sort()).toEqual([pub, crossDept, eceOnly].sort());
    // BBA member: BBA is listed nowhere.
    expect(await listIds('bba_member')).toEqual([pub]);
  });

  it('hides members-only events once the membership has expired', async () => {
    await prisma.clubMembership.updateMany({
      where: { userId: ids.member },
      data: { endDate: toDbDate(addDays(todayInDhaka(), -1)) },
    });
    try {
      expect(await listIds('member')).toEqual([pub]);
      expect((await as('member').get(`/api/v1/events/${membersOnly}`)).status).toBe(404);
    } finally {
      await prisma.clubMembership.updateMany({
        where: { userId: ids.member },
        data: { endDate: toDbDate(addDays(todayInDhaka(), 20)) },
      });
    }
  });

  it('shows drafts to organizers only', async () => {
    expect(await listIds('dept_admin')).toContain(draft);
    expect(await listIds('moderator')).toContain(draft);
    expect(await listIds('super_admin')).toContain(draft);
    expect(await listIds('ece_admin')).not.toContain(draft);
    expect(await listIds('ece_moderator')).not.toContain(draft);
    expect((await as('student').get(`/api/v1/events/${draft}`)).status).toBe(404);
  });

  it('shows a listed department’s dept_admin its members-only events', async () => {
    const seen = await listIds('ece_admin');
    expect(seen).toEqual(expect.arrayContaining([crossDept, eceOnly]));
    expect(seen).not.toContain(membersOnly);
  });

  it('agrees with GET /:id for every caller', async () => {
    for (const who of Object.keys(cookies) as Who[]) {
      const listed = new Set(await listIds(who, '?limit=100'));
      for (const id of [draft, pub, membersOnly, crossDept, eceOnly]) {
        const status = (await as(who).get(`/api/v1/events/${id}`)).status;
        expect([who, id, status]).toEqual([who, id, listed.has(id) ? 200 : 404]);
      }
    }
  });

  it('filters by status, department, club, visibility, search and pages', async () => {
    expect(await listIds('super_admin', '?status=draft')).toEqual([draft]);
    expect((await listIds('super_admin', `?department_id=${ece}`)).sort()).toEqual(
      [crossDept, eceOnly].sort(),
    );
    expect(await listIds('super_admin', `?club_id=${eceClub}`)).toEqual([eceOnly]);
    expect(await listIds('super_admin', '?visibility=public&status=upcoming')).toEqual([pub]);
    expect(await listIds('super_admin', '?search=robotics')).toEqual([crossDept]);
    const page = await as('super_admin').get('/api/v1/events?limit=2&page=2');
    expect(page.body.meta).toEqual({ page: 2, limit: 2, total: 5, total_pages: 3 });
    expect(page.body.data).toHaveLength(2);
    expect((await as('student').get('/api/v1/events?status=nope')).status).toBe(400);
  });

  it('describes what the caller may do on the detail', async () => {
    const res = await as('member').get(`/api/v1/events/${membersOnly}`);
    expect(res.body.data).toMatchObject({
      can_manage: false,
      can_register: true,
      register_blocked_reason: null,
      my_registration: null,
    });
    const admin = await as('ece_admin').get(`/api/v1/events/${crossDept}`);
    expect(admin.body.data).toMatchObject({
      can_manage: false,
      can_register: false,
      register_blocked_reason: 'not_eligible',
    });
    const sa = await as('super_admin').get(`/api/v1/events/${pub}`);
    expect(sa.body.data.register_blocked_reason).toBe('super_admin');
  });
});

describe('fan-out (DECISIONS D36)', () => {
  it('emails eligible users of a members-only event, once each, resuming from the cursor', async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE events RESTART IDENTITY CASCADE');
    const id = await published({ visibility: 'members_only', department_ids: [cse, ece] });
    sentEmails.length = 0;
    const cursors: string[] = [];
    const queued = await fanOutEventEmails({ eventId: id, kind: 'published' }, async (c) => {
      cursors.push(c);
    });
    const to = sentEmails.map((m) => m.to).sort();
    // CSE member and ECE member; not the creator, not non-members, not super_admin.
    expect(to).toEqual(['ece_member@events.test', 'member@events.test']);
    expect(queued).toBe(2);
    expect(cursors).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({ kind: 'event-published', title: 'Spring Hackathon' });

    // A retry from the saved cursor sends nothing again.
    sentEmails.length = 0;
    expect(
      await fanOutEventEmails(
        { eventId: id, kind: 'published', cursor: cursors[0] },
        async () => {},
      ),
    ).toBe(0);
  });

  it('emails every active student and faculty of the listed departments for a public event', async () => {
    const id = await published({ department_ids: [ece] });
    sentEmails.length = 0;
    await fanOutEventEmails({ eventId: id, kind: 'published' }, async () => {});
    const to = new Set(sentEmails.map((m) => m.to));
    expect(to.has('student@events.test')).toBe(true);
    expect(to.has('ece_member@events.test')).toBe(true);
    expect(to.has('dept_admin@events.test')).toBe(false); // the creator
    expect(to.has('super_admin@events.test')).toBe(false);
    expect(to.has('bba_member@events.test')).toBe(false);
  });

  it('emails registrants on cancel, and sends nothing when the status moved on', async () => {
    const id = await published();
    await as('student').post(`/api/v1/events/${id}/register`);
    sentEmails.length = 0;
    // Still published: a stale cancel job sends nothing.
    expect(await fanOutEventEmails({ eventId: id, kind: 'cancelled' }, async () => {})).toBe(0);
    await as('dept_admin').patch(`/api/v1/events/${id}/cancel`);
    await fanOutEventEmails({ eventId: id, kind: 'cancelled' }, async () => {});
    expect(sentEmails.map((m) => [m.kind, m.to])).toEqual([
      ['event-cancelled', 'student@events.test'],
    ]);
  });
});
