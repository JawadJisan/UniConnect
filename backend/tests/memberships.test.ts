import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  adminMembershipListQuerySchema,
  createMembershipSchema,
  membershipIdParamSchema,
  paymentIpnSchema,
  renewMembershipSchema,
} from '@uniconnect/shared';
import express from 'express';
import request from 'supertest';

// Pure rules of the memberships module: schemas, date math, the mock gateway, the row mapping
// and the route guards that run before any database call. Checkout, IPN, cancel, the jobs and
// every constraint run against the real database in tests/integration/memberships.int.test.ts.

type SessionResult = { headers: Headers; response: unknown };
const getSession = jest.fn<(args: unknown) => Promise<SessionResult>>();

jest.unstable_mockModule('../src/lib/auth.js', () => ({ auth: { api: { getSession } } }));
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));
jest.unstable_mockModule('../src/queues/email.queue.js', () => ({
  EMAIL_QUEUE: 'email',
  enqueueEmail: jest.fn(),
  closeEmailQueue: jest.fn(),
}));

const { Prisma } = await import('../src/generated/prisma/client.js');
const { addDays, addMonths, membershipEnd, todayInDhaka, toDbDate, fromDbDate } =
  await import('../src/lib/dates.js');
const { decodeMockValId, createMockGateway } = await import('../src/lib/payments/mock.gateway.js');
const { toMembership, toAdminMembership } =
  await import('../src/modules/memberships/membership.mapper.js');
const { membershipRouter, adminMembershipRouter } =
  await import('../src/modules/memberships/membership.routes.js');
const { requireUserType } = await import('../src/middleware/auth.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');

describe('membership request schemas', () => {
  it('accepts a club and a type, and rejects unknown keys or bad values', () => {
    expect(createMembershipSchema.parse({ club_id: 3, type: 'yearly' })).toEqual({
      club_id: 3,
      type: 'yearly',
    });
    for (const body of [
      {},
      { club_id: 3 },
      { club_id: 3, type: 'weekly' },
      { club_id: '3', type: 'monthly' },
      { club_id: 0, type: 'monthly' },
      { club_id: 3, type: 'monthly', amount: '1.00' },
      { club_id: 3, type: 'monthly', user_id: 'x' },
    ]) {
      expect(createMembershipSchema.safeParse(body).success).toBe(false);
    }
  });

  it('lets a renewal keep or change the type', () => {
    expect(renewMembershipSchema.parse({})).toEqual({});
    expect(renewMembershipSchema.parse({ type: 'monthly' })).toEqual({ type: 'monthly' });
    expect(renewMembershipSchema.safeParse({ type: 'daily' }).success).toBe(false);
    expect(renewMembershipSchema.safeParse({ start_date: '2026-01-01' }).success).toBe(false);
  });

  it('parses ids and the admin filters', () => {
    expect(membershipIdParamSchema.parse({ id: '7' })).toEqual({ id: 7 });
    expect(membershipIdParamSchema.safeParse({ id: 'my' }).success).toBe(false);
    expect(
      adminMembershipListQuerySchema.parse({ status: 'scheduled', type: 'monthly', club_id: '2' }),
    ).toEqual({ page: 1, limit: 20, status: 'scheduled', type: 'monthly', club_id: 2 });
    expect(adminMembershipListQuerySchema.safeParse({ status: 'paid' }).success).toBe(false);
    expect(adminMembershipListQuerySchema.safeParse({ department_id: '1' }).success).toBe(false);
  });

  it('reads tran_id and val_id from an IPN and lets other gateway fields through', () => {
    const parsed = paymentIpnSchema.parse({ tran_id: 'UC-1', val_id: 'V', store_amount: '9' });
    expect(parsed.tran_id).toBe('UC-1');
    expect(parsed.val_id).toBe('V');
    expect(paymentIpnSchema.safeParse({ val_id: 'V' }).success).toBe(false);
  });
});

describe('membership dates', () => {
  it('ends a monthly membership the day before the same date next month', () => {
    expect(membershipEnd('2026-11-11', 'monthly')).toBe('2026-12-10');
    expect(membershipEnd('2026-12-15', 'monthly')).toBe('2027-01-14');
  });

  it('ends a yearly membership the day before the same date next year', () => {
    expect(membershipEnd('2026-11-11', 'yearly')).toBe('2027-11-10');
    expect(membershipEnd('2028-02-29', 'yearly')).toBe('2029-02-27');
  });

  it('clamps month ends (Jan 31 + 1 month is Feb 28, or 29 in a leap year)', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(membershipEnd('2027-01-31', 'monthly')).toBe('2027-02-27');
  });

  it('starts a renewal the day after the old end, so periods never overlap', () => {
    const end = membershipEnd('2026-11-11', 'monthly');
    expect(addDays(end, 1)).toBe('2026-12-11');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('uses the Bangladesh date, not UTC', () => {
    // 19:00 UTC on Nov 11 is 01:00 on Nov 12 in Dhaka (UTC+6).
    expect(todayInDhaka(new Date('2026-11-11T19:00:00Z'))).toBe('2026-11-12');
    expect(todayInDhaka(new Date('2026-11-11T17:59:00Z'))).toBe('2026-11-11');
  });

  it('round-trips a DATE column value without shifting the day', () => {
    expect(fromDbDate(toDbDate('2026-02-28'))).toBe('2026-02-28');
  });
});

describe('mock payment gateway', () => {
  it('decodes a valid val_id into the amount, currency and tran_id it names', () => {
    expect(decodeMockValId('MOCK-VALID-UC-20261111-ABC123-500.00-BDT')).toMatchObject({
      status: 'VALID',
      tranId: 'UC-20261111-ABC123',
      amount: '500.00',
      currency: 'BDT',
      bankTranId: 'MOCKBANK-UC-20261111-ABC123',
    });
  });

  it('decodes a failed val_id and treats anything else as INVALID', () => {
    expect(decodeMockValId('MOCK-FAILED-UC-1-X')).toMatchObject({
      status: 'FAILED',
      tranId: 'UC-1-X',
    });
    expect(decodeMockValId('garbage').status).toBe('INVALID');
    expect(decodeMockValId('MOCK-VALID-500.00').status).toBe('INVALID');
  });

  it('sends the browser to the frontend mock checkout page', async () => {
    const gateway = createMockGateway('http://localhost:3000');
    const { redirectUrl } = await gateway.initSession({
      tranId: 'UC-1',
      amount: '500.00',
      currency: 'BDT',
      productName: 'x',
      customer: { name: 'A', email: 'a@x.test', phone: null },
      urls: { success: '', fail: '', cancel: '', ipn: '' },
    });
    expect(redirectUrl).toBe(
      'http://localhost:3000/dashboard/memberships/checkout/mock?tran_id=UC-1&amount=500.00',
    );
    expect(await gateway.queryTransaction('UC-1')).toBeNull();
  });
});

describe('toMembership / toAdminMembership', () => {
  const row = {
    id: 4,
    userId: 'u1',
    clubId: 2,
    type: 'monthly',
    status: 'active',
    startDate: toDbDate('2026-11-11'),
    endDate: toDbDate('2026-12-10'),
    createdAt: new Date('2026-11-11T08:00:00.000Z'),
    club: {
      id: 2,
      name: 'CSE Club',
      logoUrl: null,
      departmentId: 1,
      department: { id: 1, name: 'CSE' },
    },
    payments: [
      {
        transactionId: 'UC-1',
        amount: new Prisma.Decimal('500'),
        currency: 'BDT',
        paymentStatus: 'completed',
        validatedAt: new Date('2026-11-11T08:01:00.000Z'),
      },
    ],
  };

  it('serializes dates as YYYY-MM-DD and money as a 2-decimal string', () => {
    expect(toMembership(row)).toEqual({
      id: 4,
      type: 'monthly',
      status: 'active',
      start_date: '2026-11-11',
      end_date: '2026-12-10',
      created_at: '2026-11-11T08:00:00.000Z',
      club: { id: 2, name: 'CSE Club', logo_url: null, department: { id: 1, name: 'CSE' } },
      payment: {
        transaction_id: 'UC-1',
        amount: '500.00',
        currency: 'BDT',
        status: 'completed',
        validated_at: '2026-11-11T08:01:00.000Z',
      },
    });
  });

  it('gives payment null when there is none, and the admin row adds the member only', () => {
    expect(toMembership({ ...row, payments: [] }).payment).toBeNull();
    const admin = toAdminMembership({
      ...row,
      user: { id: 'u1', name: 'Ayesha', email: 'a@x.test', studentId: '2021-1' },
    });
    expect(admin.user).toEqual({
      id: 'u1',
      name: 'Ayesha',
      email: 'a@x.test',
      student_id: '2021-1',
    });
    expect(admin).not.toHaveProperty('userId');
  });
});

describe('route guards (before any database call)', () => {
  const app = express();
  app.use(express.json());
  app.use('/memberships', membershipRouter);
  app.use('/admin/memberships', adminMembershipRouter);
  app.get('/broken', requireUserType(['student']), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  function signedIn(user: Record<string, unknown>) {
    getSession.mockResolvedValue({
      headers: new Headers(),
      response: {
        session: { id: 's1', userId: 'u1' },
        user: {
          id: 'u1',
          role: 'student',
          userType: 'student',
          departmentId: 1,
          isActive: true,
          ...user,
        },
      },
    });
  }

  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({ headers: new Headers(), response: null });
  });

  it('returns 401 without a session on every authenticated route', async () => {
    const calls = [
      request(app).get('/memberships/my'),
      request(app).post('/memberships').send({ club_id: 1, type: 'monthly' }),
      request(app).post('/memberships/1/renew').send({}),
      request(app).patch('/memberships/1/cancel'),
      request(app).get('/admin/memberships'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it.each([
    ['faculty', 'faculty'],
    ['dept_admin', 'faculty'],
    ['super_admin', 'super_admin'],
  ])('refuses a %s (user_type %s) on the student routes with 403', async (role, userType) => {
    signedIn({ role, userType });
    const calls = [
      request(app).get('/memberships/my'),
      request(app).post('/memberships').send({ club_id: 1, type: 'monthly' }),
      request(app).post('/memberships/1/renew').send({}),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
  });

  it.each(['student', 'moderator', 'faculty'])(
    'refuses a %s on the admin list with 403',
    async (role) => {
      signedIn({ role, userType: role === 'faculty' ? 'faculty' : 'student' });
      expect((await request(app).get('/admin/memberships')).status).toBe(403);
    },
  );

  it('returns 400 for a bad purchase body, renew body, id or query', async () => {
    signedIn({});
    const bad = await Promise.all([
      request(app).post('/memberships').send({ club_id: 1 }),
      request(app).post('/memberships').send({ club_id: 1, type: 'monthly', extra: 1 }),
      request(app).post('/memberships/1/renew').send({ type: 'weekly' }),
      request(app).post('/memberships/abc/renew').send({}),
      request(app).get('/memberships/my?limit=1000'),
    ]);
    for (const res of bad) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns 400 for an IPN without tran_id, with no session needed', async () => {
    const res = await request(app).post('/memberships/payment/ipn').type('form').send('val_id=x');
    expect(res.status).toBe(400);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('requireUserType fails closed with 500 when requireAuth is missing', async () => {
    expect((await request(app).get('/broken')).status).toBe(500);
  });
});
