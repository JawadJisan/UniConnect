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

  keys() {
    return [...this.store.keys()];
  }
}

export const fakeRedis = new FakeRedis();
export const sentEmails: EmailJob[] = [];
/** Set `down` to make enqueueEmail reject, as it does when the queue's Redis is unreachable. */
export const emailQueue = { down: false };

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
    'TRUNCATE TABLE users, accounts, sessions, verifications, audit_logs RESTART IDENTITY CASCADE',
  );
  fakeRedis.reset();
  sentEmails.length = 0;
  emailQueue.down = false;
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
