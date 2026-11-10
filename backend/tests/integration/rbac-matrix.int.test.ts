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
let cseClub = 0;

interface Policy {
  method: 'get' | 'patch' | 'post';
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
