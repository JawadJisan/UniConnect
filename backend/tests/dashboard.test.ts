import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { auditLogQuerySchema, FROM_AFTER_TO } from '@uniconnect/shared';
import express from 'express';
import request from 'supertest';

// Pure rules of the dashboards and the audit-log viewer (PRD FR-DASH-001–004, FR-AUDIT-002;
// DECISIONS D13, D42): the query schema, the Dhaka date maths, the response mapping (no email)
// and the route guards that run before any database call. Counts, scoping and the services'
// reuse run against the real database in tests/integration/dashboard.int.test.ts and
// audit-logs.int.test.ts.

type SessionResult = { headers: Headers; response: unknown };
const getSession = jest.fn<(args: unknown) => Promise<SessionResult>>();

jest.unstable_mockModule('../src/lib/auth.js', () => ({ auth: { api: { getSession } } }));
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));

const { createdAtRange, dhakaDayStart, toAuditLogEntry, whereAuditLogs } =
  await import('../src/modules/audit-logs/audit-log.service.js');
const { countsBy, daysBetween, dhakaMonth } =
  await import('../src/modules/dashboard/dashboard.caller.js');
const { auditLogRouter } = await import('../src/modules/audit-logs/audit-log.routes.js');
const { dashboardRouter } = await import('../src/modules/dashboard/dashboard.routes.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');

describe('auditLogQuerySchema (FR-AUDIT-002)', () => {
  it('accepts every filter and defaults the page', () => {
    expect(
      auditLogQuerySchema.parse({
        user_id: '00000000-0000-4000-8000-000000000000',
        action: 'ROLE_CHANGED',
        entity_type: 'user',
        from: '2026-11-01',
        to: '2026-11-14',
      }),
    ).toMatchObject({ action: 'ROLE_CHANGED', page: 1, limit: 20 });
  });

  it.each([
    ['an unknown action', { action: 'DROP_TABLE' }],
    ['a bad date', { from: '2026-02-30' }],
    ['a bad user id', { user_id: 'me' }],
    ['an unknown key', { sort: 'asc' }],
    ['limit over 100', { limit: '500' }],
  ])('refuses %s', (_label, q) => {
    expect(auditLogQuerySchema.safeParse(q).success).toBe(false);
  });

  it('refuses from after to, on the from field', () => {
    const r = auditLogQuerySchema.safeParse({ from: '2026-11-14', to: '2026-11-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ['from'], message: FROM_AFTER_TO });
  });
});

describe('Dhaka date ranges', () => {
  it('maps from/to days to [00:00 Dhaka on from, 00:00 Dhaka the day after to)', () => {
    expect(dhakaDayStart('2026-11-14').toISOString()).toBe('2026-11-13T18:00:00.000Z');
    expect(createdAtRange('2026-11-01', '2026-11-14')).toEqual({
      gte: new Date('2026-10-31T18:00:00.000Z'),
      lt: new Date('2026-11-14T18:00:00.000Z'),
    });
    expect(createdAtRange(undefined, '2026-12-31')).toEqual({
      lt: new Date('2026-12-31T18:00:00.000Z'),
    });
    expect(createdAtRange()).toBeUndefined();
  });

  it('builds the where clause only from given filters', () => {
    expect(whereAuditLogs({ page: 1, limit: 20 })).toEqual({});
    expect(whereAuditLogs({ page: 1, limit: 20, action: 'LOGIN', entity_type: 'user' })).toEqual({
      action: 'LOGIN',
      entityType: 'user',
    });
  });

  it('dhakaMonth spans the Dhaka calendar month, including December', () => {
    expect(dhakaMonth('2026-11-14')).toEqual({
      from: new Date('2026-10-31T18:00:00.000Z'),
      to: new Date('2026-11-30T18:00:00.000Z'),
    });
    expect(dhakaMonth('2026-12-31').to).toEqual(new Date('2026-12-31T18:00:00.000Z'));
  });

  it('daysBetween counts whole days', () => {
    expect(daysBetween('2026-11-14', '2026-11-14')).toBe(0);
    expect(daysBetween('2026-11-14', '2026-12-14')).toBe(30);
    expect(daysBetween('2026-11-14', '2026-11-10')).toBe(-4);
  });

  it('countsBy fills zeros and ignores unknown keys', () => {
    expect(
      countsBy(['draft', 'published'] as const, [
        { key: 'published', count: 3 },
        { key: 'weird', count: 9 },
        { key: null, count: 1 },
      ]),
    ).toEqual({ draft: 0, published: 3 });
  });
});

describe('toAuditLogEntry', () => {
  const row = {
    id: 1,
    action: 'ROLE_CHANGED',
    entityType: 'user',
    entityId: 'u2',
    oldValue: { role: 'student' },
    newValue: { role: 'moderator' },
    ipAddress: '10.0.0.1',
    createdAt: new Date('2026-11-14T05:00:00.000Z'),
    user: { id: 'u1', name: 'System Admin', role: 'super_admin' },
  };

  it('returns the actor by name and role, never email', () => {
    const entry = toAuditLogEntry(row);
    expect(entry).toEqual({
      id: 1,
      action: 'ROLE_CHANGED',
      entity_type: 'user',
      entity_id: 'u2',
      old_value: { role: 'student' },
      new_value: { role: 'moderator' },
      ip_address: '10.0.0.1',
      created_at: '2026-11-14T05:00:00.000Z',
      actor: { id: 'u1', name: 'System Admin', role: 'super_admin' },
    });
    expect(JSON.stringify(entry)).not.toMatch(/email/i);
  });

  it('a system actor is null', () => {
    expect(toAuditLogEntry({ ...row, user: null, oldValue: null }).actor).toBeNull();
  });
});

describe('route guards (before any database call)', () => {
  const app = express();
  app.use('/dashboard', dashboardRouter);
  app.use('/audit-logs', auditLogRouter);
  app.use(errorHandler);

  function signedIn(role: string, userType: string) {
    getSession.mockResolvedValue({
      headers: new Headers(),
      response: {
        session: { id: 's1', userId: 'u1' },
        user: { id: 'u1', role, userType, departmentId: 1, isActive: true },
      },
    });
  }

  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({ headers: new Headers(), response: null });
  });

  const PATHS = [
    '/dashboard/student',
    '/dashboard/moderator',
    '/dashboard/dept-admin',
    '/dashboard/super-admin',
    '/audit-logs',
  ];

  it('returns 401 without a session', async () => {
    for (const res of await Promise.all(PATHS.map((p) => request(app).get(p)))) {
      expect(res.status).toBe(401);
    }
  });

  it('refuses a super admin the personal view (D13: student and faculty accounts only)', async () => {
    signedIn('super_admin', 'super_admin');
    expect((await request(app).get('/dashboard/student')).status).toBe(403);
  });

  it.each([
    [
      'student',
      'student',
      ['/dashboard/moderator', '/dashboard/dept-admin', '/dashboard/super-admin', '/audit-logs'],
    ],
    [
      'faculty',
      'faculty',
      ['/dashboard/moderator', '/dashboard/dept-admin', '/dashboard/super-admin', '/audit-logs'],
    ],
    ['moderator', 'student', ['/dashboard/dept-admin', '/dashboard/super-admin', '/audit-logs']],
    ['dept_admin', 'faculty', ['/dashboard/moderator', '/dashboard/super-admin', '/audit-logs']],
    ['super_admin', 'super_admin', ['/dashboard/moderator', '/dashboard/dept-admin']],
  ])('refuses a %s the other roles’ views with 403', async (role, userType, paths) => {
    signedIn(role, userType);
    for (const p of paths) expect([p, (await request(app).get(p)).status]).toEqual([p, 403]);
  });

  it('returns 400 for a bad audit-log query', async () => {
    signedIn('super_admin', 'super_admin');
    const bad = await Promise.all([
      request(app).get('/audit-logs?action=NOPE'),
      request(app).get('/audit-logs?from=2026-11-14&to=2026-11-01'),
      request(app).get('/audit-logs?evil=1'),
    ]);
    for (const res of bad) expect(res.status).toBe(400);
  });
});
