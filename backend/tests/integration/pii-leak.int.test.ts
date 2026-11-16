import {
  ORIGIN,
  clubFor,
  createUser,
  departmentId,
  loadHarness,
  resetDatabase,
  signInCookie,
} from './harness.js';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

// PII and secret leak audit (Phase 10, DECISIONS D46; PRD §21 "sensitive fields never returned";
// CLAUDE.md "the blood donor list never includes email"). Every role reads every GET route over
// a realistic seed (a dept admin and a moderator with real term rows, an event with a
// registration, an announcement, a blood request, a donation, a chat log). The walker:
//   - fails on any secret-like key anywhere (password, token, hash, secret),
//   - records every place an email or a phone number appears, and compares that set with the
//     allow-list below. A new place is a failure until someone decides it belongs there.

jest.setTimeout(300_000);

const h = await loadHarness();
const { app, prisma } = h;
const { addDays, todayInDhaka } = await import('../../src/lib/dates.js');

type Who = 'student' | 'faculty' | 'moderator' | 'dept_admin' | 'super_admin' | 'ece_student';
const WHO: Who[] = ['student', 'faculty', 'moderator', 'dept_admin', 'super_admin', 'ece_student'];
const ids = {} as Record<Who, string>;
const cookies = {} as Record<Who, string>;
const PHONES: Record<Who, string> = {
  student: '01710000001',
  faculty: '01710000002',
  moderator: '01710000003',
  dept_admin: '01710000004',
  super_admin: '01710000005',
  ece_student: '01710000006',
};
const REQUEST_PHONE = '01799999999';
let cseClub = 0;
let eventId = 0;

const SECRET_KEY =
  /^(password|passwordHash|token|sessionToken|session_token|secret|hash|accessToken|refreshToken|idToken)$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE = /^\+?\d{10,15}$/;

interface Hit {
  path: string;
  kind: 'email' | 'phone';
}

/** Walks a JSON body: secret-like keys throw; email and phone values are reported by path. */
function walk(value: unknown, path: string, hits: Hit[], secrets: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, `${path}[]`, hits, secrets));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const next = path ? `${path}.${key}` : key;
      if (SECRET_KEY.test(key)) secrets.push(next);
      walk(child, next, hits, secrets);
    }
    return;
  }
  if (typeof value === 'string') {
    if (EMAIL.test(value)) hits.push({ path, kind: 'email' });
    else if (PHONE.test(value)) hits.push({ path, kind: 'phone' });
  }
}

const today = todayInDhaka();

beforeAll(async () => {
  await resetDatabase(h);
  const cse = await departmentId(h, 'CSE');
  const ece = await departmentId(h, 'ECE');
  cseClub = await clubFor(h, 'CSE');
  await clubFor(h, 'ECE');

  ids.super_admin = await createUser(h, {
    email: 'admin@pii.test',
    name: 'Sys Admin',
    userType: 'super_admin',
  });
  ids.student = await createUser(h, {
    email: 'student@pii.test',
    name: 'Ayesha Rahman',
    userType: 'student',
    departmentId: cse,
  });
  ids.faculty = await createUser(h, {
    email: 'faculty@pii.test',
    name: 'Karim Hossain',
    userType: 'faculty',
    departmentId: cse,
  });
  ids.moderator = await createUser(h, {
    email: 'mod@pii.test',
    name: 'Tanvir Ahmed',
    userType: 'student',
    departmentId: cse,
  });
  ids.dept_admin = await createUser(h, {
    email: 'deptadmin@pii.test',
    name: 'Nusrat Jahan',
    userType: 'faculty',
    departmentId: cse,
  });
  ids.ece_student = await createUser(h, {
    email: 'ece@pii.test',
    name: 'Rafiq Islam',
    userType: 'student',
    departmentId: ece,
  });
  for (const who of WHO) {
    await prisma.user.update({ where: { id: ids[who] }, data: { phone: PHONES[who] } });
  }

  cookies.super_admin = await signInCookie(h, 'admin@pii.test');
  const asAdmin = (method: 'post' | 'patch', path: string, body: object = {}) =>
    request(app)[method](path).set('Origin', ORIGIN).set('Cookie', cookies.super_admin).send(body);

  // Real term rows, so roles come from RoleService like in production.
  const term = await asAdmin('post', '/api/v1/admin/dept-admin-terms', {
    user_id: ids.dept_admin,
    department_id: cse,
    start_date: today,
    end_date: addDays(today, 180),
  });
  expect(term.status).toBe(201);
  const seat = await asAdmin('post', `/api/v1/clubs/${cseClub}/committee`, {
    user_id: ids.moderator,
    position: 'President',
    term_start_year: Number(today.slice(0, 4)),
    term_end_year: Number(today.slice(0, 4)) + 1,
  });
  expect(seat.status).toBe(201);

  const start = new Date(Date.now() + 5 * 86_400_000);
  const created = await asAdmin('post', '/api/v1/events', {
    title: 'PII Audit Fair',
    organizer_club_id: cseClub,
    visibility: 'public',
    is_paid: false,
    start_date: start.toISOString(),
    end_date: new Date(start.getTime() + 3_600_000).toISOString(),
    venue: 'Hall A',
    department_ids: [cse],
  });
  expect(created.status).toBe(201);
  eventId = created.body.data.id;
  expect((await asAdmin('patch', `/api/v1/events/${eventId}/publish`)).status).toBe(200);
  expect(
    (
      await asAdmin('post', '/api/v1/announcements', {
        title: 'Orientation',
        content: 'Hall A at 10.',
        department_id: cse,
      })
    ).status,
  ).toBe(201);

  for (const who of WHO.filter((w) => w !== 'super_admin')) {
    cookies[who] = await signInCookie(
      h,
      `${who === 'ece_student' ? 'ece' : who === 'dept_admin' ? 'deptadmin' : who === 'moderator' ? 'mod' : who}@pii.test`,
    );
  }
  const as = (who: Who, path: string, body: object) =>
    request(app).post(path).set('Origin', ORIGIN).set('Cookie', cookies[who]).send(body);

  expect((await as('student', `/api/v1/events/${eventId}/register`, {})).status).toBe(201);
  expect(
    (
      await as('student', '/api/v1/blood/requests', {
        patient_name: 'Rahim',
        blood_group: 'A+',
        units_needed: 1,
        contact_phone: REQUEST_PHONE,
        hospital_name: 'Dhaka Medical',
        required_by_date: addDays(today, 3),
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await as('faculty', '/api/v1/blood/donations', {
        donation_date: addDays(today, -30),
        hospital_name: 'Square Hospital',
      })
    ).status,
  ).toBe(201);
  await prisma.chatLog.create({
    data: { userId: ids.student, question: 'What events are coming up?', answer: 'A fair.' },
  });
});

/** Every GET route, with real ids filled in. Routes a role may not use answer 403/404. */
const routes = () => [
  '/api/v1/users/me',
  '/api/v1/users/me/sessions',
  '/api/v1/departments',
  '/api/v1/admin/users',
  `/api/v1/admin/users/${ids.student}`,
  '/api/v1/clubs',
  '/api/v1/clubs/my-club',
  `/api/v1/clubs/${cseClub}`,
  `/api/v1/clubs/${cseClub}/committee`,
  `/api/v1/clubs/${cseClub}/committee/candidates?search=a`,
  '/api/v1/memberships/my',
  '/api/v1/admin/memberships',
  '/api/v1/admin/dept-admin-terms',
  '/api/v1/events',
  '/api/v1/events/my-registrations',
  `/api/v1/events/${eventId}`,
  `/api/v1/events/${eventId}/registrations`,
  '/api/v1/announcements',
  '/api/v1/blood/donations/my',
  '/api/v1/blood/donors',
  '/api/v1/blood/requests',
  '/api/v1/admin/blood/donations/unverified',
  '/api/v1/dashboard/student',
  '/api/v1/dashboard/moderator',
  '/api/v1/dashboard/dept-admin',
  '/api/v1/dashboard/super-admin',
  '/api/v1/admin/audit-logs?limit=100',
  '/api/v1/admin/chatbot/logs',
];

/**
 * Where an email or a phone number may appear, reviewed 2026-11-15 (D46). Route, kind, JSON path.
 * - Own profile: the caller's own email and phone.
 * - Super admin only (the RBAC matrix refuses everyone else): user management (FR-USER-005)
 *   and the dept-admin term list (FR-ADMIN-004).
 * - Blood (FR-BLOOD-004, -006): a donor's phone, which the donor list shows as "Not shared" when
 *   empty, and the contact phone the requester typed on a request. Never an email (CLAUDE.md).
 */
const ALLOWED = new Set([
  '/api/v1/users/me email data.email',
  '/api/v1/users/me phone data.phone',
  '/api/v1/admin/users email data[].email',
  '/api/v1/admin/users/:id email data.email',
  '/api/v1/admin/users/:id phone data.phone',
  '/api/v1/admin/dept-admin-terms email data[].user.email',
  '/api/v1/blood/donors phone data[].phone',
  '/api/v1/blood/requests phone data[].contact_phone',
  '/api/v1/dashboard/student phone data.blood_requests[].contact_phone',
]);

/** Strips ids and query strings so a finding reads the same on every run. */
const routeKey = (path: string) =>
  path
    .split('?')[0]!
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');

describe('PII and secret leak audit', () => {
  it('returns no secret-like keys, and emails and phones only where allowed', async () => {
    const secrets: string[] = [];
    const seen = new Set<string>();
    for (const who of WHO) {
      for (const path of routes()) {
        const res = await request(app).get(path).set('Origin', ORIGIN).set('Cookie', cookies[who]);
        if (res.status !== 200) continue;
        const hits: Hit[] = [];
        const found: string[] = [];
        walk(res.body, '', hits, found);
        for (const s of found) secrets.push(`${who} ${routeKey(path)} ${s}`);
        for (const hit of hits) seen.add(`${who} ${routeKey(path)} ${hit.kind} ${hit.path}`);
      }
    }
    expect(secrets).toEqual([]);
    const unexpected = [...seen].filter((entry) => {
      const [, route, kind, path] = entry.split(' ');
      return !ALLOWED.has(`${route} ${kind} ${path}`);
    });
    expect(unexpected).toEqual([]);
    // The places that must stay free of contact details, whoever reads them.
    for (const entry of seen) {
      expect(entry).not.toMatch(/\/blood\/donors email/);
      expect(entry).not.toMatch(/\/(chatbot\/logs|registrations|candidates|committee) /);
    }
  });

  it('lets only the super admin see another person’s email', () => {
    // Every email outside /users/me sits on a route the matrix limits to super_admin.
    const others = [...ALLOWED].filter(
      (e) => e.includes(' email ') && !e.startsWith('/api/v1/users/me'),
    );
    expect(others.every((e) => /^\/api\/v1\/admin\//.test(e))).toBe(true);
  });
});
