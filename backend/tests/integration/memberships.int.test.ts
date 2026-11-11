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
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AUDIT_ACTIONS, type Role } from '@uniconnect/shared';
import request from 'supertest';

// Memberships and payments (PRD FR-MEM-001–005, DECISIONS D11, D32) against the real database:
// the partial unique indexes, the status CHECK, the row locks and the transactions are real.
// The payment gateway is the mock (PAYMENT_GATEWAY=mock), whose val_id encodes the "validated"
// amount, currency and tran_id, so every validation branch runs for real.

const h = await loadHarness();
const { app, prisma } = h;
const { membershipService } = await import('../../src/modules/memberships/membership.service.js');
const { paymentGateway } = await import('../../src/lib/payments/index.js');
const { addDays, membershipEnd, todayInDhaka, toDbDate, fromDbDate } =
  await import('../../src/lib/dates.js');

type Who =
  | 'student'
  | 'student2'
  | 'faculty'
  | 'moderator'
  | 'dept_admin'
  | 'super_admin'
  | 'ece_admin'
  | 'ece_student';
const ids = {} as Record<Who, string>;
const cookies = {} as Record<Who, string>;

const ACCOUNTS: {
  key: Who;
  role: Role;
  userType: 'student' | 'faculty' | 'super_admin';
  dept: 'CSE' | 'ECE';
}[] = [
  { key: 'student', role: 'student', userType: 'student', dept: 'CSE' },
  { key: 'student2', role: 'student', userType: 'student', dept: 'CSE' },
  { key: 'faculty', role: 'faculty', userType: 'faculty', dept: 'CSE' },
  { key: 'moderator', role: 'moderator', userType: 'student', dept: 'CSE' },
  { key: 'dept_admin', role: 'dept_admin', userType: 'faculty', dept: 'CSE' },
  { key: 'super_admin', role: 'super_admin', userType: 'super_admin', dept: 'CSE' },
  { key: 'ece_admin', role: 'dept_admin', userType: 'faculty', dept: 'ECE' },
  { key: 'ece_student', role: 'student', userType: 'student', dept: 'ECE' },
];

let cseClub: number;
let eceClub: number;
let today: string;

beforeAll(async () => {
  await resetDatabase(h);
  const cse = await departmentId(h, 'CSE');
  const ece = await departmentId(h, 'ECE');
  for (const a of ACCOUNTS) {
    const email = `${a.key}@memberships.test`;
    ids[a.key] = await createUser(h, {
      email,
      name: `User ${a.key}`,
      role: a.role,
      userType: a.userType,
      departmentId: a.dept === 'CSE' ? cse : ece,
    });
    cookies[a.key] = await signInCookie(h, email);
  }
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE payment_transactions, club_memberships RESTART IDENTITY CASCADE',
  );
  await prisma.auditLog.deleteMany({
    where: { action: { notIn: [AUDIT_ACTIONS.LOGIN] } },
  });
  cseClub = await clubFor(h, 'CSE', { membershipFeeMonthly: '500.00', membershipFeeYearly: null });
  eceClub = await clubFor(h, 'ECE', { membershipFeeMonthly: '300.00' });
  sentEmails.length = 0;
  today = todayInDhaka();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---- helpers ----

const send = (method: 'get' | 'post' | 'patch', path: string, who?: Who) => {
  const req = request(app)[method](path).set('Origin', ORIGIN);
  return who ? req.set('Cookie', cookies[who]) : req;
};
const buy = (who: Who, body: object = { club_id: cseClub, type: 'monthly' }) =>
  send('post', '/api/v1/memberships', who).send(body);
const renew = (who: Who, id: number, body: object = {}) =>
  send('post', `/api/v1/memberships/${id}/renew`, who).send(body);
const cancel = (who: Who, id: number) => send('patch', `/api/v1/memberships/${id}/cancel`, who);
const ipn = (fields: Record<string, string>) =>
  request(app).post('/api/v1/memberships/payment/ipn').type('form').send(fields);
const valid = (tranId: string, amount = '500.00', currency = 'BDT') =>
  `MOCK-VALID-${tranId}-${amount}-${currency}`;

const membership = (id: number) => prisma.clubMembership.findUniqueOrThrow({ where: { id } });
const paymentOf = (tranId: string) =>
  prisma.paymentTransaction.findUniqueOrThrow({ where: { transactionId: tranId } });
const audits = (action: string) =>
  prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

/** Buys and pays a membership; returns its id and transaction id. */
async function activeMembership(who: Who = 'student', clubId = cseClub) {
  const res = await buy(who, { club_id: clubId, type: 'monthly' });
  expect(res.status).toBe(201);
  const tranId: string = res.body.data.transaction_id;
  const amount: string = res.body.data.membership.payment.amount;
  expect((await ipn({ tran_id: tranId, val_id: valid(tranId, amount) })).status).toBe(200);
  return { id: res.body.data.membership.id as number, tranId };
}

// ---- FR-MEM-001 ----

describe('POST /api/v1/memberships', () => {
  it('opens a pending checkout with a pending payment and returns the mock redirect', async () => {
    const res = await buy('student');

    expect(res.status).toBe(201);
    const { membership: m, transaction_id: tranId, redirect_url: url } = res.body.data;
    expect(tranId).toMatch(/^UC-\d{8}-[0-9A-F]{12}$/);
    expect(url).toContain(`/dashboard/memberships/checkout/mock?tran_id=${tranId}`);
    expect(m).toMatchObject({
      status: 'pending',
      type: 'monthly',
      start_date: today,
      end_date: membershipEnd(today, 'monthly'),
      club: { id: cseClub },
      payment: { transaction_id: tranId, amount: '500.00', currency: 'BDT', status: 'pending' },
    });
    const payment = await paymentOf(tranId);
    expect(payment.paymentStatus).toBe('pending');
    expect(payment.amount.toFixed(2)).toBe('500.00');
    expect(payment.userId).toBe(ids.student);
  });

  it('lets a student moderator buy (user_type rule, PRD §5)', async () => {
    expect((await buy('moderator')).status).toBe(201);
  });

  it('refuses another department’s club with 403 and an unknown club with 404', async () => {
    expect((await buy('student', { club_id: eceClub, type: 'monthly' })).status).toBe(403);
    const res = await buy('student', { club_id: 999999, type: 'monthly' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLUB_NOT_FOUND');
  });

  it('returns 409 when the club has no fee for that type, or a zero fee', async () => {
    let res = await buy('student', { club_id: cseClub, type: 'yearly' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEMBERSHIP_FEE_NOT_SET');

    await clubFor(h, 'CSE', { membershipFeeMonthly: '0.00' });
    res = await buy('student');
    expect(res.body.error.code).toBe('MEMBERSHIP_FEE_NOT_SET');
  });

  it('returns 409 CHECKOUT_IN_PROGRESS while a recent checkout is open', async () => {
    expect((await buy('student')).status).toBe(201);
    const res = await buy('student');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHECKOUT_IN_PROGRESS');
  });

  it('replaces a checkout older than 30 minutes', async () => {
    const first = await buy('student');
    const oldId: number = first.body.data.membership.id;
    await prisma.clubMembership.update({
      where: { id: oldId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });

    expect((await buy('student')).status).toBe(201);

    expect((await membership(oldId)).status).toBe('cancelled');
    expect((await paymentOf(first.body.data.transaction_id)).paymentStatus).toBe('failed');
    const [audit] = await audits(AUDIT_ACTIONS.CHECKOUT_EXPIRED);
    expect(audit).toMatchObject({ userId: ids.student, entityId: String(oldId) });
  });

  it('lets only one of two concurrent checkouts through', async () => {
    const results = await Promise.all([buy('student2'), buy('student2'), buy('student2')]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409]);
    expect(
      await prisma.clubMembership.count({ where: { userId: ids.student2, status: 'pending' } }),
    ).toBe(1);
  });

  it('returns 409 MEMBERSHIP_ALREADY_ACTIVE once a membership is active', async () => {
    await activeMembership();
    const res = await buy('student');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEMBERSHIP_ALREADY_ACTIVE');
  });

  it('cancels the checkout and answers 502 when the gateway cannot open a session', async () => {
    jest.spyOn(paymentGateway, 'initSession').mockRejectedValueOnce(new Error('down'));

    const res = await buy('student');

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('PAYMENT_GATEWAY_ERROR');
    const [m] = await prisma.clubMembership.findMany({ where: { userId: ids.student } });
    expect(m?.status).toBe('cancelled');
    expect((await audits(AUDIT_ACTIONS.PAYMENT_FAILED))[0]?.newValue).toMatchObject({
      reason: 'gateway_session_failed',
    });
    // The student can try again straight away.
    expect((await buy('student')).status).toBe(201);
  });
});

// ---- IPN ----

describe('POST /api/v1/memberships/payment/ipn', () => {
  it('activates the membership only after validation, with audits and a receipt', async () => {
    const res = await buy('student');
    const tranId: string = res.body.data.transaction_id;
    const id: number = res.body.data.membership.id;

    const hook = await ipn({ tran_id: tranId, val_id: valid(tranId), status: 'VALID' });

    expect(hook.status).toBe(200);
    expect(hook.body).toEqual({ success: true, data: { received: true } });
    const m = await membership(id);
    expect(m.status).toBe('active');
    expect(fromDbDate(m.startDate)).toBe(today);
    expect(fromDbDate(m.endDate)).toBe(membershipEnd(today, 'monthly'));
    const p = await paymentOf(tranId);
    expect(p).toMatchObject({
      paymentStatus: 'completed',
      valId: valid(tranId),
      bankTranId: `MOCKBANK-${tranId}`,
      paymentMethod: 'MOCK-CARD',
    });
    expect(p.validatedAt).not.toBeNull();
    expect(p.paymentGatewayResponse).toMatchObject({ gateway: 'mock', status: 'VALID' });

    const [completed] = await audits(AUDIT_ACTIONS.PAYMENT_COMPLETED);
    const [purchased] = await audits(AUDIT_ACTIONS.MEMBERSHIP_PURCHASED);
    expect(completed).toMatchObject({ userId: null, entityType: 'payment_transaction' });
    expect(purchased).toMatchObject({ userId: null, entityId: String(id) });
    expect(sentEmails).toEqual([
      expect.objectContaining({
        kind: 'membership-receipt',
        to: 'student@memberships.test',
        status: 'active',
        amount: '500.00',
        transactionId: tranId,
      }),
    ]);
  });

  it('treats a repeated IPN as a no-op', async () => {
    const { tranId } = await activeMembership();
    const before = await prisma.auditLog.count();

    expect((await ipn({ tran_id: tranId, val_id: valid(tranId) })).status).toBe(200);

    expect(await prisma.auditLog.count()).toBe(before);
    expect(sentEmails).toHaveLength(1);
  });

  it('settles concurrent duplicate IPNs once', async () => {
    const res = await buy('student');
    const tranId: string = res.body.data.transaction_id;
    const hooks = await Promise.all(
      [1, 2, 3].map(() => ipn({ tran_id: tranId, val_id: valid(tranId) })),
    );
    expect(hooks.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await audits(AUDIT_ACTIONS.PAYMENT_COMPLETED)).toHaveLength(1);
    expect(await audits(AUDIT_ACTIONS.MEMBERSHIP_PURCHASED)).toHaveLength(1);
  });

  it.each([
    ['a different amount', (t: string) => valid(t, '1.00'), 'amount_mismatch'],
    ['a different currency', (t: string) => valid(t, '500.00', 'USD'), 'currency_mismatch'],
    ['a FAILED validation', (t: string) => `MOCK-FAILED-${t}`, 'validation_failed'],
  ])('fails the payment and cancels the membership on %s', async (_label, valId, reason) => {
    const res = await buy('student');
    const tranId: string = res.body.data.transaction_id;

    expect((await ipn({ tran_id: tranId, val_id: valId(tranId) })).status).toBe(200);

    expect((await paymentOf(tranId)).paymentStatus).toBe('failed');
    expect((await membership(res.body.data.membership.id)).status).toBe('cancelled');
    const [audit] = await audits(AUDIT_ACTIONS.PAYMENT_FAILED);
    expect(audit?.newValue).toMatchObject({ reason });
    expect(sentEmails).toHaveLength(0);
  });

  it('ignores a val_id that belongs to another transaction (no forged cancel)', async () => {
    const res = await buy('student');
    const tranId: string = res.body.data.transaction_id;

    for (const valId of [valid('UC-OTHER-1'), 'garbage']) {
      expect((await ipn({ tran_id: tranId, val_id: valId })).status).toBe(200);
    }

    expect((await paymentOf(tranId)).paymentStatus).toBe('pending');
    expect((await membership(res.body.data.membership.id)).status).toBe('pending');
  });

  it('answers 200 and changes nothing for an unknown tran_id or a missing val_id', async () => {
    const res = await buy('student');
    const tranId: string = res.body.data.transaction_id;

    expect((await ipn({ tran_id: 'UC-NOPE', val_id: valid('UC-NOPE') })).status).toBe(200);
    expect((await ipn({ tran_id: tranId, status: 'FAILED' })).status).toBe(200);

    expect((await paymentOf(tranId)).paymentStatus).toBe('pending');
  });

  it('answers 502 and keeps the row pending when validation is unreachable', async () => {
    const res = await buy('student');
    const tranId: string = res.body.data.transaction_id;
    jest.spyOn(paymentGateway, 'validateOrder').mockRejectedValueOnce(new Error('timeout'));

    expect((await ipn({ tran_id: tranId, val_id: valid(tranId) })).status).toBe(502);
    expect((await paymentOf(tranId)).paymentStatus).toBe('pending');
  });

  it('records a payment for a membership cancelled before the IPN, without reviving it', async () => {
    const res = await buy('student');
    const tranId: string = res.body.data.transaction_id;
    const id: number = res.body.data.membership.id;
    expect((await cancel('student', id)).status).toBe(200);
    // Cancel fails the pending payment; put it back to model a payment that went through anyway.
    await prisma.paymentTransaction.update({
      where: { transactionId: tranId },
      data: { paymentStatus: 'pending' },
    });

    expect((await ipn({ tran_id: tranId, val_id: valid(tranId) })).status).toBe(200);

    expect((await membership(id)).status).toBe('cancelled');
    expect((await paymentOf(tranId)).paymentStatus).toBe('completed');
    const [audit] = await audits(AUDIT_ACTIONS.PAYMENT_COMPLETED);
    expect(audit?.newValue).toMatchObject({ note: 'membership_cancelled_before_payment' });
  });
});

// ---- FR-MEM-002 ----

describe('POST /api/v1/memberships/:id/renew', () => {
  it('schedules an early renewal from the day after the old end date', async () => {
    const { id: oldId } = await activeMembership();
    const oldEnd = fromDbDate((await membership(oldId)).endDate);

    const res = await renew('student', oldId);
    expect(res.status).toBe(201);
    const newId: number = res.body.data.membership.id;
    expect(newId).not.toBe(oldId);
    expect(res.body.data.membership).toMatchObject({
      status: 'pending',
      start_date: addDays(oldEnd, 1),
    });

    const tranId: string = res.body.data.transaction_id;
    await ipn({ tran_id: tranId, val_id: valid(tranId) });

    const renewed = await membership(newId);
    expect(renewed.status).toBe('scheduled');
    expect(fromDbDate(renewed.startDate)).toBe(addDays(oldEnd, 1));
    expect(fromDbDate(renewed.endDate)).toBe(membershipEnd(addDays(oldEnd, 1), 'monthly'));
    expect((await membership(oldId)).status).toBe('active');
    expect(await audits(AUDIT_ACTIONS.MEMBERSHIP_SCHEDULED)).toHaveLength(1);
    expect(sentEmails.at(-1)).toMatchObject({ kind: 'membership-receipt', status: 'scheduled' });

    const again = await renew('student', oldId);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('RENEWAL_ALREADY_SCHEDULED');
  });

  it('starts a scheduled renewal when the daily job expires the old one', async () => {
    const { id: oldId } = await activeMembership();
    const res = await renew('student', oldId);
    const newId: number = res.body.data.membership.id;
    await ipn({
      tran_id: res.body.data.transaction_id,
      val_id: valid(res.body.data.transaction_id),
    });
    // Move time forward: the old membership ended yesterday, the renewal starts today.
    await prisma.clubMembership.update({
      where: { id: oldId },
      data: { startDate: toDbDate(addDays(today, -30)), endDate: toDbDate(addDays(today, -1)) },
    });
    await prisma.clubMembership.update({
      where: { id: newId },
      data: { startDate: toDbDate(today), endDate: toDbDate(membershipEnd(today, 'monthly')) },
    });

    expect(await membershipService.expireAndActivate()).toEqual({ expired: 1, activated: 1 });

    expect((await membership(oldId)).status).toBe('expired');
    expect((await membership(newId)).status).toBe('active');
    expect(await audits(AUDIT_ACTIONS.MEMBERSHIP_EXPIRED)).toHaveLength(1);
    expect(await audits(AUDIT_ACTIONS.MEMBERSHIP_ACTIVATED)).toHaveLength(1);
    // A second run finds nothing.
    expect(await membershipService.expireAndActivate()).toEqual({ expired: 0, activated: 0 });
  });

  it('renews an expired membership from today, with a new type if asked', async () => {
    const { id: oldId } = await activeMembership();
    await prisma.clubMembership.update({ where: { id: oldId }, data: { status: 'expired' } });
    await clubFor(h, 'CSE', { membershipFeeMonthly: '500.00', membershipFeeYearly: '5000.00' });

    const res = await renew('student', oldId, { type: 'yearly' });
    expect(res.status).toBe(201);
    expect(res.body.data.membership).toMatchObject({ type: 'yearly', start_date: today });
    expect(res.body.data.membership.payment.amount).toBe('5000.00');
    const tranId: string = res.body.data.transaction_id;
    await ipn({ tran_id: tranId, val_id: valid(tranId, '5000.00') });
    expect((await membership(res.body.data.membership.id)).status).toBe('active');
  });

  it('hides another student’s membership with 404', async () => {
    const { id } = await activeMembership('student');
    const res = await renew('student2', id);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MEMBERSHIP_NOT_FOUND');
  });

  it('refuses to renew a pending or cancelled membership with 409', async () => {
    const res = await buy('student');
    const id: number = res.body.data.membership.id;
    expect((await renew('student', id)).body.error.code).toBe('MEMBERSHIP_NOT_RENEWABLE');
    await cancel('student', id);
    expect((await renew('student', id)).status).toBe(409);
  });
});

// ---- FR-MEM-003 ----

describe('PATCH /api/v1/memberships/:id/cancel', () => {
  it('lets the owner cancel an active membership once, with an audit row', async () => {
    const { id } = await activeMembership();

    const res = await cancel('student', id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    const [audit] = await audits(AUDIT_ACTIONS.MEMBERSHIP_CANCELLED);
    expect(audit).toMatchObject({
      userId: ids.student,
      entityId: String(id),
      oldValue: { status: 'active' },
      newValue: { status: 'cancelled', cancelled_by: 'owner' },
    });

    const again = await cancel('student', id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('MEMBERSHIP_NOT_CANCELLABLE');
  });

  it('fails the pending payment when a checkout is cancelled', async () => {
    const res = await buy('student');
    await cancel('student', res.body.data.membership.id);
    expect((await paymentOf(res.body.data.transaction_id)).paymentStatus).toBe('failed');
  });

  it.each<[Who, number]>([
    ['dept_admin', 200],
    ['super_admin', 200],
    ['ece_admin', 404],
    ['faculty', 404],
    ['moderator', 404],
    ['student2', 404],
  ])('as %s answers %i', async (who, status) => {
    const { id } = await activeMembership('student');
    const res = await cancel(who, id);
    expect(res.status).toBe(status);
    expect((await membership(id)).status).toBe(status === 200 ? 'cancelled' : 'active');
  });

  it('returns 404 for an unknown id and 401 without a session', async () => {
    expect((await cancel('super_admin', 999999)).status).toBe(404);
    expect((await send('patch', '/api/v1/memberships/1/cancel')).status).toBe(401);
  });
});

// ---- FR-MEM-004 / 005 ----

describe('membership lists', () => {
  beforeEach(async () => {
    await activeMembership('student');
    await buy('moderator');
    await activeMembership('ece_student', eceClub);
  });

  it('GET /my returns only the caller’s memberships, in the D9 envelope', async () => {
    const res = await send('get', '/api/v1/memberships/my', 'student');
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, total_pages: 1 });
    expect(res.body.data[0]).toMatchObject({ status: 'active', club: { id: cseClub } });
    expect(res.body.data[0]).not.toHaveProperty('user');
  });

  it('GET /admin/memberships keeps a dept_admin inside their department', async () => {
    const cse = await send('get', '/api/v1/admin/memberships', 'dept_admin');
    expect(cse.status).toBe(200);
    expect(cse.body.meta.total).toBe(2);
    expect(cse.body.data.every((m: { club: { id: number } }) => m.club.id === cseClub)).toBe(true);
    expect(cse.body.data[0].user).toEqual(
      expect.objectContaining({ name: expect.any(String), email: expect.any(String) }),
    );

    const crossClub = await send(
      'get',
      `/api/v1/admin/memberships?club_id=${eceClub}`,
      'dept_admin',
    );
    expect(crossClub.body.meta.total).toBe(0);

    const ece = await send('get', '/api/v1/admin/memberships', 'ece_admin');
    expect(ece.body.meta.total).toBe(1);
  });

  it('GET /admin/memberships shows super_admin everything, with status and type filters', async () => {
    const all = await send('get', '/api/v1/admin/memberships', 'super_admin');
    expect(all.body.meta.total).toBe(3);
    const pending = await send('get', '/api/v1/admin/memberships?status=pending', 'super_admin');
    expect(pending.body.meta.total).toBe(1);
    const yearly = await send('get', '/api/v1/admin/memberships?type=yearly', 'super_admin');
    expect(yearly.body.meta.total).toBe(0);
    const bad = await send('get', '/api/v1/admin/memberships?status=paid', 'super_admin');
    expect(bad.status).toBe(400);
  });
});

// ---- jobs and constraints ----

describe('cancel-stale-pending job', () => {
  it('cancels only checkouts older than 30 minutes', async () => {
    const stale = await buy('student');
    const fresh = await buy('student2');
    await prisma.clubMembership.update({
      where: { id: stale.body.data.membership.id },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });

    expect(await membershipService.cancelStale()).toBe(1);

    expect((await membership(stale.body.data.membership.id)).status).toBe('cancelled');
    expect((await paymentOf(stale.body.data.transaction_id)).paymentStatus).toBe('failed');
    expect((await membership(fresh.body.data.membership.id)).status).toBe('pending');
    const [audit] = await audits(AUDIT_ACTIONS.CHECKOUT_EXPIRED);
    expect(audit).toMatchObject({ userId: null, newValue: { reason: 'stale_checkout' } });
  });
});

describe('database invariants (DECISIONS D11)', () => {
  const row = (status: string) => ({
    userId: ids.student,
    clubId: cseClub,
    type: 'monthly',
    status,
    startDate: toDbDate('2026-01-01'),
    endDate: toDbDate('2026-01-31'),
  });

  it('allows one pending-or-scheduled row per user and club', async () => {
    await prisma.clubMembership.create({ data: row('scheduled') });
    await expect(prisma.clubMembership.create({ data: row('pending') })).rejects.toMatchObject({
      code: 'P2002',
    });
    // Closed rows don't count.
    await prisma.clubMembership.create({ data: row('cancelled') });
    await prisma.clubMembership.create({ data: row('expired') });
  });

  it('rejects a status outside the CHECK and accepts scheduled', async () => {
    await expect(prisma.clubMembership.create({ data: row('paid') })).rejects.toThrow();
    await expect(prisma.clubMembership.create({ data: row('scheduled') })).resolves.toBeTruthy();
  });
});
