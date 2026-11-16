import {
  ORIGIN,
  clubFor,
  createUser,
  departmentId,
  fakeRedis,
  gemini,
  loadHarness,
  resetDatabase,
  signInCookie,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FALLBACK_ANSWER } from '@uniconnect/shared';
import request from 'supertest';

// FR-AI-001–003 against the real database, Gemini mocked at its client module (DECISIONS
// D44). The point of these tests is what reaches the prompt: retrieval must apply the events
// browse rule (D36) and the announcement scope (D15) before the full-text search, so a
// members-only event, a club-only post, a draft or another department's members-only event
// never reaches Gemini for someone who couldn't open it. Also: the scope-aware cache, the
// shared per-user limit, ChatLog rows, the admin log viewer and the 90-day purge.

jest.setTimeout(240_000);

const h = await loadHarness();
const { app, prisma } = h;
const { addDays, toDbDate, todayInDhaka } = await import('../../src/lib/dates.js');
const { visibleScope } = await import('../../src/modules/announcements/announcement.access.js');
const { announcementRepository, whereVisible } =
  await import('../../src/modules/announcements/announcement.repository.js');
const { chatbotService } = await import('../../src/modules/chatbot/chatbot.service.js');

type Who = 'member' | 'nonmember' | 'moderator' | 'ece_student' | 'faculty' | 'super_admin';

const ids = {} as Record<Who, string>;
const cookies = {} as Record<Who, string>;
const ev = {} as Record<'open' | 'secret' | 'draft' | 'eceSecret' | 'pii', number>;
const posts = {} as Record<'dept' | 'club' | 'ece', number>;
let cse = 0;
let ece = 0;
let cseClub = 0;
let eceClub = 0;

const today = todayInDhaka();
const soon = new Date(Date.now() + 7 * 86_400_000);

const ask = (who: Who, question: string) =>
  request(app)
    .post('/api/v1/chatbot/ask')
    .set('Origin', ORIGIN)
    .set('Cookie', cookies[who])
    .send({ question });

/** The context part of the last prompt Gemini received. */
const lastPrompt = () => gemini.calls.at(-1)?.prompt ?? '';

async function event(
  clubId: number,
  departments: number[],
  data: { title: string; status?: string; visibility?: string; description?: string },
) {
  const row = await prisma.event.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      organizerClubId: clubId,
      visibility: data.visibility ?? 'public',
      startDate: soon,
      endDate: new Date(soon.getTime() + 2 * 3_600_000),
      venue: 'Room 301',
      status: data.status ?? 'published',
      createdById: ids.super_admin,
      departments: { create: departments.map((departmentId) => ({ departmentId })) },
    },
  });
  return row.id;
}

async function post(title: string, scope: { clubId?: number; departmentId?: number }) {
  const row = await prisma.announcement.create({
    data: {
      title,
      content: `${title} details. uniconnectnotice`,
      clubId: scope.clubId ?? null,
      departmentId: scope.departmentId ?? null,
      authorId: ids.super_admin,
    },
  });
  return row.id;
}

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
    member: { userType: 'student', dept: cse },
    nonmember: { userType: 'student', dept: cse },
    moderator: { userType: 'student', role: 'moderator', dept: cse },
    ece_student: { userType: 'student', dept: ece },
    faculty: { userType: 'faculty', dept: cse },
    super_admin: { userType: 'super_admin' },
  };
  for (const [who, a] of Object.entries(accounts) as [Who, (typeof accounts)[Who]][]) {
    const email = `${who}@chat.test`;
    ids[who] = await createUser(h, {
      email,
      name: who,
      userType: a.userType,
      ...(a.role ? { role: a.role } : {}),
      departmentId: a.dept ?? null,
    });
    cookies[who] = await signInCookie(h, email);
  }

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

  ev.open = await event(cseClub, [cse], { title: 'Codefest Open Day' });
  ev.secret = await event(cseClub, [cse], {
    title: 'Hackathon Secret Night',
    visibility: 'members_only',
  });
  ev.draft = await event(cseClub, [cse], { title: 'Draftnight Planning', status: 'draft' });
  ev.eceSecret = await event(eceClub, [ece], {
    title: 'Robotics Gala',
    visibility: 'members_only',
  });
  ev.pii = await event(cseClub, [cse], {
    title: 'Volunteer Drive',
    description: 'Contact nadia.islam@cse.uni.edu or 01712345678 to sign up.',
  });

  posts.dept = await post('Orientation Notice', { departmentId: cse });
  posts.club = await post('Treasury Update', { clubId: cseClub });
  posts.ece = await post('Lab Closure', { departmentId: ece });
});

beforeEach(() => {
  // Each test starts with an empty cache and fresh rate-limit counters.
  fakeRedis.reset();
  gemini.configured = true;
  gemini.fail = false;
  gemini.reply = 'Here is what I found.';
  gemini.calls.length = 0;
});

describe('POST /chatbot/ask: retrieval follows visibility (FR-AI-001)', () => {
  it('gives a club member the members-only event, and never a non-member', async () => {
    const res = await ask('member', 'When is the hackathon secret night?');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      answer: 'Here is what I found.',
      sources: expect.arrayContaining([{ type: 'event', id: ev.secret }]),
    });
    expect(lastPrompt()).toContain('Hackathon Secret Night');

    for (const who of ['nonmember', 'ece_student', 'faculty'] as const) {
      const other = await ask(who, 'When is the hackathon secret night?');
      expect(other.status).toBe(200);
      expect([who, lastPrompt()]).not.toEqual([who, expect.stringContaining('Hackathon Secret')]);
      expect(other.body.data.sources).not.toContainEqual({ type: 'event', id: ev.secret });
    }
  });

  it('gives the club moderator their own members-only event', async () => {
    await ask('moderator', 'hackathon secret');
    expect(lastPrompt()).toContain('Hackathon Secret Night');
  });

  it('never retrieves a draft, not even for the super admin', async () => {
    await ask('super_admin', 'draftnight planning');
    expect(lastPrompt()).not.toContain('Draftnight');
    await ask('moderator', 'draftnight planning');
    expect(lastPrompt()).not.toContain('Draftnight');
  });

  it("keeps another department's members-only event from everyone but the super admin", async () => {
    await ask('member', 'robotics gala');
    expect(lastPrompt()).not.toContain('Robotics Gala');
    await ask('super_admin', 'robotics gala');
    expect(lastPrompt()).toContain('Robotics Gala');
  });

  it('gives a club post to members and the committee only (D15)', async () => {
    await ask('member', 'treasury update');
    expect(lastPrompt()).toContain('Treasury Update');
    await ask('moderator', 'treasury update');
    expect(lastPrompt()).toContain('Treasury Update');
    for (const who of ['nonmember', 'faculty', 'ece_student'] as const) {
      await ask(who, 'treasury update');
      expect([who, lastPrompt()]).not.toEqual([who, expect.stringContaining('Treasury Update')]);
    }
  });

  it('keeps department posts inside the department', async () => {
    await ask('ece_student', 'orientation notice');
    expect(lastPrompt()).not.toContain('Orientation Notice');
    await ask('nonmember', 'orientation notice');
    expect(lastPrompt()).toContain('Orientation Notice');
  });

  it('agrees with the announcement feed rule for every caller (visibleSql = whereVisible)', async () => {
    for (const who of Object.keys(ids) as Who[]) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: ids[who] },
        select: { role: true, departmentId: true },
      });
      const scope = await visibleScope(prisma, {
        id: ids[who],
        role: user.role,
        departmentId: user.departmentId,
        ip: null,
      });
      const feed = await prisma.announcement.findMany({
        where: whereVisible(scope, {}),
        select: { id: true },
      });
      const search = await announcementRepository.searchVisible(
        prisma,
        scope,
        'uniconnectnotice:*',
        100,
      );
      expect([who, search.map((a) => a.id).sort()]).toEqual([who, feed.map((a) => a.id).sort()]);
    }
  });

  it('strips emails and phone numbers before anything reaches Gemini', async () => {
    const res = await ask('member', 'volunteer drive, my number is 01898765432');
    expect(res.status).toBe(200);
    const prompt = lastPrompt();
    expect(prompt).toContain('Volunteer Drive');
    expect(prompt).toContain('[email removed]');
    expect(prompt).not.toMatch(/nadia\.islam@|01712345678|01898765432/);
  });

  it('falls back to the soonest upcoming events it can show when nothing matches', async () => {
    const res = await ask('nonmember', 'zzqx');
    expect(res.status).toBe(200);
    expect(lastPrompt()).toContain('Codefest Open Day');
    expect(lastPrompt()).not.toContain('Hackathon Secret');
  });

  it('answers the PRD fallback with no sources when Gemini says nothing', async () => {
    gemini.reply = '';
    const res = await ask('member', 'codefest');
    expect(res.body.data).toEqual({ answer: FALLBACK_ANSWER, sources: [] });
  });
});

describe('cache, ChatLog and failures', () => {
  it('serves a repeat from the cache for the same scope, and logs both asks', async () => {
    const before = await prisma.chatLog.count({ where: { userId: ids.faculty } });
    await ask('faculty', 'When is Codefest?');
    const again = await ask('faculty', '  when is   CODEFEST? ');
    expect(again.status).toBe(200);
    expect(gemini.calls).toHaveLength(1);
    expect(await prisma.chatLog.count({ where: { userId: ids.faculty } })).toBe(before + 2);
  });

  it('never serves one scope another scope’s answer', async () => {
    await ask('member', 'hackathon secret night');
    await ask('nonmember', 'hackathon secret night');
    await ask('moderator', 'hackathon secret night');
    expect(gemini.calls).toHaveLength(3);
  });

  it('logs the question with PII stripped', async () => {
    await ask('member', 'Call me on 01712345678 about codefest');
    const row = await prisma.chatLog.findFirstOrThrow({
      where: { userId: ids.member },
      orderBy: { id: 'desc' },
    });
    expect(row.question).toBe('Call me on [phone removed] about codefest');
    expect(row.answer).toBe('Here is what I found.');
  });

  it('answers 503 when Gemini fails, caching and logging nothing', async () => {
    const before = await prisma.chatLog.count();
    gemini.fail = true;
    const res = await ask('member', 'codefest open day');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    expect(await prisma.chatLog.count()).toBe(before);

    gemini.fail = false;
    expect((await ask('member', 'codefest open day')).status).toBe(200);
    expect(gemini.calls).toHaveLength(2);
  });

  it('answers 503 AI_NOT_CONFIGURED without a key or model', async () => {
    gemini.configured = false;
    const res = await ask('member', 'codefest');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('AI_NOT_CONFIGURED');
  });
});

describe('the shared per-user limit (10 a minute)', () => {
  it('answers the 11th AI request in a minute with 429, across both AI routes', async () => {
    for (let i = 0; i < 9; i += 1) {
      expect((await ask('moderator', `codefest ${i}`)).status).toBe(200);
    }
    const draft = await request(app)
      .post('/api/v1/ai/generate-event-description')
      .set('Origin', ORIGIN)
      .set('Cookie', cookies.moderator)
      .send({ title: 'Codefest', club_name: 'CSE Club', date: '2026-12-02', venue: 'Room 301' });
    expect(draft.status).toBe(200);
    const res = await ask('moderator', 'codefest again');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    // Someone else still has their own bucket.
    expect((await ask('member', 'codefest')).status).toBe(200);
  });
});

describe('POST /ai/generate-event-description (FR-AI-003)', () => {
  it('returns the draft for an organizer, from the details as data', async () => {
    gemini.reply = 'Join the CSE Club for Codefest. Bring a laptop.';
    const res = await request(app)
      .post('/api/v1/ai/generate-event-description')
      .set('Origin', ORIGIN)
      .set('Cookie', cookies.super_admin)
      .send({
        title: 'Codefest',
        club_name: 'CSE Club',
        date: '2026-12-02T10:00:00+06:00',
        venue: 'Room 301, call 01712345678',
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      description: 'Join the CSE Club for Codefest. Bring a laptop.',
    });
    expect(lastPrompt()).toContain('"title": "Codefest"');
    expect(lastPrompt()).not.toContain('01712345678');
  });

  it('refuses students and checks the body', async () => {
    const student = await request(app)
      .post('/api/v1/ai/generate-event-description')
      .set('Origin', ORIGIN)
      .set('Cookie', cookies.member)
      .send({ title: 'x', club_name: 'y', date: '2026-12-02', venue: 'z' });
    expect(student.status).toBe(403);
    const bad = await request(app)
      .post('/api/v1/ai/generate-event-description')
      .set('Origin', ORIGIN)
      .set('Cookie', cookies.moderator)
      .send({ title: '', club_name: 'y', date: 'soon', venue: 'z' });
    expect(bad.status).toBe(400);
  });
});

describe('GET /admin/chatbot/logs (FR-AI-002)', () => {
  const logs = (query = '', who: Who = 'super_admin') =>
    request(app)
      .get(`/api/v1/admin/chatbot/logs${query}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookies[who]);

  beforeAll(async () => {
    await prisma.chatLog.createMany({
      data: [
        { userId: ids.faculty, question: 'Where is the fee list?', answer: 'A' },
        { userId: ids.member, question: 'When is codefest?', answer: 'B' },
      ],
    });
  });

  it('lists newest first with the asker by name and role, never email', async () => {
    const res = await logs('?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 2 });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual({
      id: expect.any(Number),
      question: expect.any(String),
      answer: expect.any(String),
      created_at: expect.any(String),
      user: { id: expect.any(String), name: expect.any(String), role: expect.any(String) },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/@chat\.test/);
  });

  it('filters by asker, question text and Dhaka days', async () => {
    const mine = await logs(`?user_id=${ids.faculty}&search=FEE`);
    expect(mine.body.data.map((r: { question: string }) => r.question)).toContain(
      'Where is the fee list?',
    );
    expect(mine.body.data.every((r: { user: { id: string } }) => r.user.id === ids.faculty)).toBe(
      true,
    );
    expect((await logs(`?from=${today}&to=${today}`)).body.meta.total).toBeGreaterThan(0);
    const tomorrow = addDays(today, 1);
    expect((await logs(`?from=${tomorrow}`)).body.meta.total).toBe(0);
    expect((await logs(`?from=${tomorrow}&to=${today}`)).status).toBe(400);
  });

  it('is for the super admin only', async () => {
    for (const who of ['member', 'moderator', 'faculty'] as const) {
      expect([who, (await logs('', who)).status]).toEqual([who, 403]);
    }
  });
});

describe('purge-chat-logs (PRD #18: 90 days)', () => {
  it('deletes only rows older than 90 days', async () => {
    const now = new Date();
    const old = await prisma.chatLog.create({
      data: {
        userId: ids.member,
        question: 'old',
        answer: 'old',
        createdAt: new Date(now.getTime() - 91 * 86_400_000),
      },
    });
    const recent = await prisma.chatLog.create({
      data: {
        userId: ids.member,
        question: 'recent',
        answer: 'recent',
        createdAt: new Date(now.getTime() - 89 * 86_400_000),
      },
    });
    expect(await chatbotService.purgeOldLogs(now)).toBe(1);
    expect(await prisma.chatLog.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.chatLog.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });
});
