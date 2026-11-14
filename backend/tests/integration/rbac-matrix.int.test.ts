import {
  ORIGIN,
  clubFor,
  createUser,
  departmentId,
  loadHarness,
  resetDatabase,
  signInCookie,
} from './harness.js';
import { beforeAll, describe, expect, it } from '@jest/globals';
import { ROLES, type Role } from '@uniconnect/shared';
import request from 'supertest';

// Task 2.5: one policy table for every protected /api/v1 route. Each route is called with no
// session and as each of the five roles. A role in `allowed` must not get 401 or 403 (the body
// may still be a 400 or 404: authorization passed); every other role must get 403.
//
// Add each new protected route here. moderator and dept_admin are faked by writing `role`
// directly (allowed by users_role_vs_type), so the matrix needs no term rows.

const h = await loadHarness();
const { app } = h;

const ALL: readonly Role[] = ROLES;
const SUPER: readonly Role[] = ['super_admin'];
const SOME_USER = '00000000-0000-4000-8000-000000000000';
/** Club routes act on the CSE club, the department every matrix account belongs to. */
const CLUB_EDITORS: readonly Role[] = ['dept_admin', 'super_admin'];
/** Memberships are bought by user_type student; the matrix moderator is a student (PRD §5). */
const STUDENT_TYPE: readonly Role[] = ['student', 'moderator'];
const ADMINS: readonly Role[] = ['dept_admin', 'super_admin'];
const NO_MEMBERSHIP = 999999;
/** A committee row or term id that doesn't exist: authorization passes, then 400 or 404. */
const NO_ROW = 999999;
/** Event organizers (D36); which club they may manage is checked by the service (404 here). */
const ORGANIZERS: readonly Role[] = ['moderator', 'dept_admin', 'super_admin'];
/** Everyone but super_admin registers for events (FR-EVENT-007). */
const ATTENDEES: readonly Role[] = ['student', 'faculty', 'moderator', 'dept_admin'];
/** Announcement posters (D38); which club or department they may use is checked by the service. */
const POSTERS: readonly Role[] = ['moderator', 'dept_admin', 'super_admin'];
/** Pinning is for dept_admin and super_admin (FR-ANNOUNCE-004). */
const PINNERS: readonly Role[] = ['dept_admin', 'super_admin'];
/** Everyone but super_admin records blood donations (FR-BLOOD-001, -003). */
const DONORS: readonly Role[] = ['student', 'faculty', 'moderator', 'dept_admin'];
let cseClub = 0;

interface Policy {
  method: 'get' | 'patch' | 'post' | 'delete';
  path: string;
  allowed: readonly Role[];
  body?: object;
}

const POLICY: Policy[] = [
  { method: 'get', path: '/api/v1/users/me', allowed: ALL },
  { method: 'patch', path: '/api/v1/users/me', allowed: ALL, body: {} },
  { method: 'patch', path: '/api/v1/users/me/avatar', allowed: ALL },
  { method: 'get', path: '/api/v1/users/me/sessions', allowed: ALL },
  { method: 'get', path: '/api/v1/admin/users', allowed: SUPER },
  { method: 'get', path: `/api/v1/admin/users/${SOME_USER}`, allowed: SUPER },
  { method: 'patch', path: `/api/v1/admin/users/${SOME_USER}`, allowed: SUPER, body: {} },
  {
    method: 'patch',
    path: `/api/v1/admin/users/${SOME_USER}/status`,
    allowed: SUPER,
    body: { is_active: true },
  },
  { method: 'post', path: `/api/v1/admin/users/${SOME_USER}/recompute-role`, allowed: SUPER },
  { method: 'get', path: '/api/v1/clubs', allowed: ALL },
  { method: 'get', path: '/api/v1/clubs/my-club', allowed: ALL },
  { method: 'get', path: '/api/v1/clubs/:club', allowed: ALL },
  { method: 'patch', path: '/api/v1/clubs/:club', allowed: CLUB_EDITORS, body: {} },
  { method: 'patch', path: '/api/v1/clubs/:club/logo', allowed: CLUB_EDITORS },
  // POST /memberships/payment/ipn is public (the gateway's callback); memberships.int covers it.
  { method: 'get', path: '/api/v1/memberships/my', allowed: STUDENT_TYPE },
  { method: 'post', path: '/api/v1/memberships', allowed: STUDENT_TYPE, body: {} },
  {
    method: 'post',
    path: `/api/v1/memberships/${NO_MEMBERSHIP}/renew`,
    allowed: STUDENT_TYPE,
    body: {},
  },
  // Owner, the club's dept_admin or super_admin; the service answers 404 to anyone else.
  { method: 'patch', path: `/api/v1/memberships/${NO_MEMBERSHIP}/cancel`, allowed: ALL },
  { method: 'get', path: '/api/v1/admin/memberships', allowed: ADMINS },
  // Committee (D34): anyone signed in reads it; the club's dept_admin or super_admin manages it.
  { method: 'get', path: '/api/v1/clubs/:club/committee', allowed: ALL },
  {
    method: 'get',
    path: '/api/v1/clubs/:club/committee/candidates?search=a',
    allowed: CLUB_EDITORS,
  },
  { method: 'post', path: '/api/v1/clubs/:club/committee', allowed: CLUB_EDITORS, body: {} },
  {
    method: 'patch',
    path: `/api/v1/clubs/:club/committee/${NO_ROW}`,
    allowed: CLUB_EDITORS,
    body: {},
  },
  {
    method: 'patch',
    path: `/api/v1/clubs/:club/committee/${NO_ROW}/end-term`,
    allowed: CLUB_EDITORS,
  },
  // Dept admin terms (D34): super_admin only.
  { method: 'get', path: '/api/v1/admin/dept-admin-terms', allowed: SUPER },
  { method: 'post', path: '/api/v1/admin/dept-admin-terms', allowed: SUPER, body: {} },
  { method: 'patch', path: `/api/v1/admin/dept-admin-terms/${NO_ROW}/end`, allowed: SUPER },
  {
    method: 'post',
    path: `/api/v1/admin/dept-admin-terms/${NO_ROW}/renew`,
    allowed: SUPER,
    body: {},
  },
  // Events (D36). NO_ROW doesn't exist, so allowed roles get 404 from the service.
  { method: 'post', path: '/api/v1/events', allowed: ORGANIZERS, body: {} },
  { method: 'get', path: '/api/v1/events', allowed: ALL },
  { method: 'get', path: '/api/v1/events/my-registrations', allowed: ALL },
  { method: 'get', path: `/api/v1/events/${NO_ROW}`, allowed: ALL },
  { method: 'patch', path: `/api/v1/events/${NO_ROW}`, allowed: ORGANIZERS, body: {} },
  { method: 'patch', path: `/api/v1/events/${NO_ROW}/poster`, allowed: ORGANIZERS },
  { method: 'patch', path: `/api/v1/events/${NO_ROW}/publish`, allowed: ORGANIZERS },
  { method: 'patch', path: `/api/v1/events/${NO_ROW}/cancel`, allowed: ORGANIZERS },
  { method: 'patch', path: `/api/v1/events/${NO_ROW}/complete`, allowed: ORGANIZERS },
  { method: 'post', path: `/api/v1/events/${NO_ROW}/register`, allowed: ATTENDEES },
  { method: 'delete', path: `/api/v1/events/${NO_ROW}/register`, allowed: ATTENDEES },
  { method: 'get', path: `/api/v1/events/${NO_ROW}/registrations`, allowed: ORGANIZERS },
  {
    method: 'patch',
    path: `/api/v1/events/${NO_ROW}/registrations/${NO_ROW}/check-in`,
    allowed: ORGANIZERS,
  },
  // An empty body is a 400 and a missing id a 404 once authorization passes.
  { method: 'post', path: '/api/v1/announcements', allowed: POSTERS, body: {} },
  { method: 'get', path: '/api/v1/announcements', allowed: ALL },
  {
    method: 'patch',
    path: `/api/v1/announcements/${NO_ROW}`,
    allowed: POSTERS,
    body: { title: 'x' },
  },
  { method: 'delete', path: `/api/v1/announcements/${NO_ROW}`, allowed: POSTERS },
  { method: 'patch', path: `/api/v1/announcements/${NO_ROW}/pin`, allowed: PINNERS },
  // Blood (D40). Empty bodies are 400s and missing rows 404s once authorization passes; who may
  // cancel a given request is the service's check, so the route itself is open to every role.
  { method: 'post', path: '/api/v1/blood/donations', allowed: DONORS, body: {} },
  { method: 'get', path: '/api/v1/blood/donations/my', allowed: DONORS },
  { method: 'patch', path: `/api/v1/blood/donations/${NO_ROW}/verify`, allowed: ADMINS },
  { method: 'get', path: '/api/v1/blood/donors', allowed: ALL },
  { method: 'post', path: '/api/v1/blood/requests', allowed: ALL, body: {} },
  { method: 'get', path: '/api/v1/blood/requests', allowed: ALL },
  { method: 'patch', path: `/api/v1/blood/requests/${NO_ROW}/fulfill`, allowed: ALL },
  { method: 'patch', path: `/api/v1/blood/requests/${NO_ROW}/cancel`, allowed: ALL },
  { method: 'get', path: '/api/v1/admin/blood/donations/unverified', allowed: ADMINS },
  // Dashboards (D13, D42). The personal view is for every student and faculty account, whatever
  // its role; the matrix moderator holds no seat, so their view answers 404 after the role check.
  { method: 'get', path: '/api/v1/dashboard/student', allowed: DONORS },
  { method: 'get', path: '/api/v1/dashboard/moderator', allowed: ['moderator'] },
  { method: 'get', path: '/api/v1/dashboard/dept-admin', allowed: ['dept_admin'] },
  { method: 'get', path: '/api/v1/dashboard/super-admin', allowed: SUPER },
  { method: 'get', path: '/api/v1/admin/audit-logs', allowed: SUPER },
];

const ACCOUNTS: Record<Role, { userType: 'student' | 'faculty' | 'super_admin' }> = {
  student: { userType: 'student' },
  faculty: { userType: 'faculty' },
  moderator: { userType: 'student' },
  dept_admin: { userType: 'faculty' },
  super_admin: { userType: 'super_admin' },
};

const cookies = {} as Record<Role, string>;

beforeAll(async () => {
  await resetDatabase(h);
  const cse = await departmentId(h, 'CSE');
  cseClub = await clubFor(h, 'CSE');
  for (const role of ROLES) {
    const email = `${role}@rbac.test`;
    await createUser(h, { email, role, departmentId: cse, ...ACCOUNTS[role] });
    cookies[role] = await signInCookie(h, email);
  }
});

function call(p: Policy, cookie?: string) {
  const path = p.path.replace(':club', String(cseClub));
  let req = request(app)[p.method](path).set('Origin', ORIGIN);
  if (cookie) req = req.set('Cookie', cookie);
  return p.body ? req.send(p.body) : req;
}

describe.each(POLICY)('$method $path', (p) => {
  it('returns 401 without a session', async () => {
    expect((await call(p)).status).toBe(401);
  });

  it.each(ROLES)('as %s', async (role) => {
    const { status } = await call(p, cookies[role]);
    if (p.allowed.includes(role)) {
      expect([role, status]).not.toEqual([role, 401]);
      expect([role, status]).not.toEqual([role, 403]);
    } else {
      expect([role, status]).toEqual([role, 403]);
    }
  });
});
