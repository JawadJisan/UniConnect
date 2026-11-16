// Shared setup for integration tests. Import `loadHarness()` at the top of each test file,
// before anything from src/, so the module mocks below are registered first.
//
// Real: Express app, Better Auth, Prisma and Postgres (the Neon `test` branch, enforced by
// scripts/with-test-db.mjs). Faked: Redis (an in-memory store that runs the rate-limit script)
// and the email queue (jobs are captured so tests can follow verify and reset links).
import { afterAll, jest } from '@jest/globals';
import type { EmailJob } from '../../src/queues/email.queue.js';

interface Counter {
  count: number;
  expiresAt: number;
  /** The stored string, for keys written by SET (the chatbot cache). */
  value?: string;
}

/** In-memory stand-in for the shared ioredis client: enough for `consume()` and `ping()`. */
export class FakeRedis {
  private store = new Map<string, Counter>();
  /** When set, every command rejects, to test the fail-open and fail-closed paths. */
  down = false;

  reset() {
    this.store.clear();
    this.down = false;
  }

  private alive() {
    if (this.down) return Promise.reject(new Error('Connection is closed.'));
    return Promise.resolve();
  }

  async ping() {
    await this.alive();
    return 'PONG';
  }

  /** Implements the INCR + EXPIRE script from src/lib/auth.ts. */
  async eval(_script: string, _numKeys: number, key: string, window: number | string) {
    await this.alive();
    const now = Date.now();
    let entry = this.store.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + Number(window) * 1000 };
      this.store.set(key, entry);
    }
    entry.count += 1;
    return [entry.count, Math.ceil((entry.expiresAt - now) / 1000)];
  }

  /**
   * `SET key value EX seconds [NX]`: the event reminder marker uses NX, the chatbot cache
   * (DECISIONS D44) doesn't.
   */
  async set(key: string, value: string, _ex: 'EX', seconds: number, nx?: 'NX') {
    await this.alive();
    const now = Date.now();
    const entry = this.store.get(key);
    if (nx && entry && entry.expiresAt > now) return null;
    this.store.set(key, { count: 1, expiresAt: now + seconds * 1000, value });
    return 'OK';
  }

  async get(key: string) {
    await this.alive();
    const entry = this.store.get(key);
    return entry && entry.expiresAt > Date.now() ? (entry.value ?? null) : null;
  }

  async del(key: string) {
    await this.alive();
    return this.store.delete(key) ? 1 : 0;
  }

  keys() {
    return [...this.store.keys()];
  }
}

export const fakeRedis = new FakeRedis();
export const sentEmails: EmailJob[] = [];
/** Set `down` to make enqueueEmail reject, as it does when the queue's Redis is unreachable. */
export const emailQueue = { down: false };
type EventJobKind = 'published' | 'cancelled' | 'reminder';
/** Event fan-out jobs queued by publish, cancel and the reminder run (DECISIONS D36). */
export const eventJobs: { eventId: number; kind: EventJobKind }[] = [];
/**
 * Set `down` to make every queue report `unavailable`, as a Redis outage does. The real
 * module would build BullMQ queues on FakeRedis, whose counts never settle and whose handles
 * keep Jest from exiting, so the harness stands in for it (DECISIONS D42).
 */
export const queueHealthState = { down: false };
const QUEUE_NAMES = ['email', 'memberships', 'terms', 'events', 'blood', 'chatbot'] as const;

jest.unstable_mockModule('../../src/lib/redis.js', () => ({
  redis: fakeRedis,
  createRedis: () => fakeRedis,
}));
jest.unstable_mockModule('../../src/queues/email.queue.js', () => ({
  EMAIL_QUEUE: 'email',
  enqueueEmail: async (job: EmailJob) => {
    if (emailQueue.down) throw new Error('email queue unavailable: Connection is closed.');
    sentEmails.push(job);
  },
  closeEmailQueue: async () => {},
}));
jest.unstable_mockModule('../../src/queues/event.queue.js', () => ({
  EVENT_QUEUE: 'events',
  NOTIFY_EVENT_JOB: 'notify-event',
  EVENT_JOBS: { REMINDERS: 'event-reminders' },
  queueEventNotification: async (eventId: number, kind: EventJobKind) => {
    eventJobs.push({ eventId, kind });
  },
  scheduleEventJobs: async () => {},
  closeEventQueue: async () => {},
}));
/**
 * Gemini stand-in (DECISIONS D44). Every call is recorded, so tests can read the exact context
 * a user's question was answered from. `configured` false makes the AI routes answer 503;
 * `fail` makes the call throw; `reply` sets the answer text.
 */
export const gemini = {
  configured: true,
  fail: false,
  reply: 'Here is what I found.',
  calls: [] as { system: string; prompt: string }[],
};
jest.unstable_mockModule('../../src/lib/gemini.js', () => ({
  aiConfigured: () => gemini.configured,
  generateText: async (input: { system: string; prompt: string }) => {
    gemini.calls.push({ system: input.system, prompt: input.prompt });
    if (gemini.fail) throw new Error('gemini: down');
    return gemini.reply;
  },
}));
jest.unstable_mockModule('../../src/queues/chatbot.queue.js', () => ({
  CHATBOT_QUEUE: 'chatbot',
  CHATBOT_JOBS: { PURGE_LOGS: 'purge-chat-logs' },
  scheduleChatbotJobs: async () => {},
  closeChatbotQueue: async () => {},
}));
jest.unstable_mockModule('../../src/lib/queue-health.js', () => ({
  QUEUE_NAMES,
  queueHealth: async () =>
    QUEUE_NAMES.map((name) =>
      queueHealthState.down
        ? { name, state: 'unavailable' as const, counts: null }
        : {
            name,
            state: 'ok' as const,
            counts: { waiting: 0, active: 0, delayed: 0, failed: 0 },
          },
    ),
  closeQueueHealth: async () => {},
}));

export async function loadHarness() {
  const { app } = await import('../../src/app.js');
  const { prisma } = await import('../../src/lib/prisma.js');
  const { env } = await import('../../src/config/env.js');
  afterAll(() => prisma.$disconnect());
  return { app, prisma, env };
}

type Harness = Awaited<ReturnType<typeof loadHarness>>;

/** The browser origin. Better Auth checks Origin on cookie-bearing and callback requests. */
export const ORIGIN = 'http://localhost:3000';

export const PASSWORD = 'Str0ng!pass';

/** Empties every user-owned table. Departments (seeded) stay. */
export async function resetDatabase({ prisma }: Harness) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE users, accounts, sessions, verifications, audit_logs, chat_logs RESTART IDENTITY CASCADE',
  );
  fakeRedis.reset();
  sentEmails.length = 0;
  eventJobs.length = 0;
  emailQueue.down = false;
  queueHealthState.down = false;
  gemini.configured = true;
  gemini.fail = false;
  gemini.reply = 'Here is what I found.';
  gemini.calls.length = 0;
}

/** The V1 departments, as prisma/seed.ts writes them. Upserted so tests need no seed run. */
const DEPARTMENTS = [
  { name: 'CSE', description: 'Computer Science and Engineering' },
  { name: 'ECE', description: 'Electronics and Communication Engineering' },
  { name: 'BBA', description: 'Bachelor of Business Administration' },
];

export async function departmentId({ prisma }: Harness, name: string) {
  const data = DEPARTMENTS.find((d) => d.name === name);
  if (!data) throw new Error(`unknown department ${name}`);
  const dept = await prisma.department.upsert({
    where: { name },
    update: {},
    create: data,
    select: { id: true },
  });
  return dept.id;
}

export function studentBody(deptId: number, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ayesha Rahman',
    email: 'ayesha@example.com',
    password: PASSWORD,
    department_id: deptId,
    blood_group: 'B+',
    academic_session: '2022-2023',
    current_year: 3,
    current_semester: 1,
    student_id: 'CSE-2022/014',
    ...overrides,
  };
}

export function facultyBody(deptId: number, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Dr. Karim Hossain',
    email: 'karim@example.com',
    password: PASSWORD,
    department_id: deptId,
    blood_group: 'O+',
    ...overrides,
  };
}

/** The last email of a kind sent to an address, as a path + query on the app. */
export function lastLink(kind: EmailJob['kind'], to: string) {
  const job = [...sentEmails].reverse().find((j) => j.kind === kind && j.to === to);
  if (!job) throw new Error(`no ${kind} email to ${to}`);
  const url = new URL(job.url);
  return `${url.pathname}${url.search}`;
}

/** The session cookie pair (`name=value`) from a Set-Cookie response, or undefined. */
export function sessionCookie(setCookie: string[] | string | undefined) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const raw = list.find((c) => c.includes('session_token='));
  return raw?.split(';')[0];
}

export interface SeedUser {
  email: string;
  name?: string;
  userType: 'student' | 'faculty' | 'super_admin';
  /** Defaults to user_type. Set it to fake a derived role without term rows. */
  role?: string;
  departmentId?: number | null;
  studentId?: string;
  isActive?: boolean;
}

/**
 * Creates a verified user with PASSWORD straight in the database, the way prisma/seed.ts
 * does. Registration can't create super admins, and moderator/dept_admin need term rows, so
 * the admin and RBAC tests use this instead of the HTTP flow.
 */
export async function createUser(h: Harness, u: SeedUser) {
  const { auth } = await import('../../src/lib/auth.js');
  const hash = await (await auth.$context).password.hash(PASSWORD);
  const student = u.userType === 'student';
  const user = await h.prisma.user.create({
    data: {
      email: u.email,
      name: u.name ?? 'Test User',
      emailVerified: true,
      isActive: u.isActive ?? true,
      userType: u.userType,
      role: u.role ?? u.userType,
      departmentId: u.userType === 'super_admin' ? null : (u.departmentId ?? null),
      bloodGroup: u.userType === 'super_admin' ? null : 'A+',
      ...(student && {
        academicSession: '2022-2023',
        currentYear: 2,
        currentSemester: 1,
        studentId: u.studentId ?? `ID-${u.email.split('@')[0]}`,
      }),
    },
    select: { id: true },
  });
  await h.prisma.account.create({
    data: { userId: user.id, accountId: user.id, providerId: 'credential', password: hash },
  });
  return user.id;
}

/** Signs in with PASSWORD and returns the session cookie pair. */
export async function signInCookie(h: Harness, email: string) {
  const { default: request } = await import('supertest');
  const res = await request(h.app)
    .post('/api/auth/sign-in/email')
    .set('Origin', ORIGIN)
    .send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`sign-in ${email} failed: ${res.status}`);
  return sessionCookie(res.headers['set-cookie'])!;
}

/**
 * The department's club, upserted and reset to the seed values (plus `overrides`) so each
 * test starts from a known row. resetDatabase doesn't truncate clubs, which seed.ts owns.
 */
export async function clubFor(
  h: Harness,
  dept: string,
  overrides: {
    name?: string;
    description?: string | null;
    logoUrl?: string | null;
    membershipFeeMonthly?: string | null;
    membershipFeeYearly?: string | null;
  } = {},
) {
  const deptId = await departmentId(h, dept);
  const values = {
    name: `${dept} Club`,
    description: null,
    logoUrl: null,
    membershipFeeMonthly: null,
    membershipFeeYearly: null,
    ...overrides,
  };
  const club = await h.prisma.club.upsert({
    where: { departmentId: deptId },
    update: values,
    create: { departmentId: deptId, ...values },
    select: { id: true },
  });
  return club.id;
}
