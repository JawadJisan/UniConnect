import {
  ORIGIN,
  createUser,
  departmentId,
  loadHarness,
  resetDatabase,
  sentEmails,
  signInCookie,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AUDIT_ACTIONS } from '@uniconnect/shared';
import request from 'supertest';

// FR-BLOOD-001–010 against the real database (DECISIONS D14, D40): donations and their
// verification (department isolation, self-verify, the latest verified date, races), the donor
// directory (consent by donation, phone but never email), requests with fulfill and cancel
// (ownership, department scope, races), and the daily expiry job.

jest.setTimeout(180_000);

const h = await loadHarness();
const { app, prisma } = h;
const { addDays, toDbDate, todayInDhaka } = await import('../../src/lib/dates.js');
const { requestService } = await import('../../src/modules/blood/request.service.js');

type Who =
  | 'donor'
  | 'donor2'
  | 'faculty'
  | 'moderator'
  | 'cse_admin'
  | 'ece_admin'
  | 'ece_student'
  | 'super_admin';

const ids = {} as Record<Who, string>;
const cookies = {} as Record<Who, string>;
let suspendedId = '';
let cse = 0;
let ece = 0;

const send = (who: Who, method: 'get' | 'post' | 'patch', path: string, body?: object) => {
  const req = request(app)[method](path).set('Origin', ORIGIN).set('Cookie', cookies[who]);
  return method === 'get' ? req : req.send(body ?? {});
};

const today = () => todayInDhaka();

async function donate(who: Who, donation_date: string, extra: Record<string, unknown> = {}) {
  const res = await send(who, 'post', '/api/v1/blood/donations', { donation_date, ...extra });
  if (res.status !== 201) throw new Error(`donate: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.id as number;
}

const verify = (who: Who, id: number) => send(who, 'patch', `/api/v1/blood/donations/${id}/verify`);

const requestBody = (extra: Record<string, unknown> = {}) => ({
  patient_name: 'Rahim',
  blood_group: 'O-',
  units_needed: 2,
  contact_phone: '+8801711111111',
  hospital_name: 'Dhaka Medical',
  required_by_date: addDays(today(), 3),
  ...extra,
});

async function postRequest(who: Who, extra: Record<string, unknown> = {}) {
  const res = await send(who, 'post', '/api/v1/blood/requests', requestBody(extra));
  if (res.status !== 201) throw new Error(`request: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.id as number;
}

const audits = (action: string, entityId: number) =>
  prisma.auditLog.findMany({ where: { action, entityId: String(entityId) } });

const lastDonation = async (id: string) => {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id },
    select: { lastDonationDate: true },
  });
  return u.lastDonationDate?.toISOString().slice(0, 10) ?? null;
};

beforeAll(async () => {
  await resetDatabase(h);
  cse = await departmentId(h, 'CSE');
  ece = await departmentId(h, 'ECE');
  const accounts: Record<
    Who,
    { userType: 'student' | 'faculty' | 'super_admin'; role?: string; dept?: number }
  > = {
    donor: { userType: 'student', dept: cse },
    donor2: { userType: 'student', dept: cse },
    faculty: { userType: 'faculty', dept: cse },
    moderator: { userType: 'student', role: 'moderator', dept: cse },
    cse_admin: { userType: 'faculty', role: 'dept_admin', dept: cse },
    ece_admin: { userType: 'faculty', role: 'dept_admin', dept: ece },
    ece_student: { userType: 'student', dept: ece },
    super_admin: { userType: 'super_admin' },
  };
  for (const [who, a] of Object.entries(accounts) as [Who, (typeof accounts)[Who]][]) {
    const email = `${who}@blood.test`;
    ids[who] = await createUser(h, {
      email,
      name: who,
      userType: a.userType,
      ...(a.role ? { role: a.role } : {}),
      departmentId: a.dept ?? null,
    });
    cookies[who] = await signInCookie(h, email);
  }
  await prisma.user.update({ where: { id: ids.donor }, data: { phone: '+8801700000001' } });
  suspendedId = await createUser(h, {
    email: 'suspended@blood.test',
    userType: 'student',
    departmentId: cse,
    isActive: false,
  });
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE blood_donations, blood_requests, audit_logs RESTART IDENTITY',
  );
  await prisma.user.updateMany({ data: { lastDonationDate: null } });
  sentEmails.length = 0;
});

describe('POST /blood/donations (FR-BLOOD-001)', () => {
  it('records an unverified donation with the profile blood group', async () => {
    const res = await send('donor', 'post', '/api/v1/blood/donations', {
      donation_date: today(),
      units: 2,
      hospital_name: 'Red Crescent',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      blood_group: 'A+',
      donation_date: today(),
      units: 2,
      verified: false,
      verified_at: null,
      verifier: null,
    });
    expect(await lastDonation(ids.donor)).toBeNull();
  });

  it('refuses a future date and a bad body with 400', async () => {
    const future = await send('donor', 'post', '/api/v1/blood/donations', {
      donation_date: addDays(today(), 1),
    });
    expect(future.status).toBe(400);
    expect(future.body.error.code).toBe('DONATION_DATE_FUTURE');
    const bad = await send('donor', 'post', '/api/v1/blood/donations', {
      donation_date: today(),
      units: 9,
    });
    expect(bad.status).toBe(400);
  });

  it('refuses a super_admin with 403', async () => {
    const res = await send('super_admin', 'post', '/api/v1/blood/donations', {
      donation_date: today(),
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /blood/donations/my (FR-BLOOD-003)', () => {
  it('lists only the caller’s donations, newest first, with status', async () => {
    const older = await donate('donor', addDays(today(), -30));
    const newer = await donate('donor', addDays(today(), -2));
    await donate('donor2', today());
    await verify('cse_admin', older);

    const res = await send('donor', 'get', '/api/v1/blood/donations/my');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 2, page: 1 });
    expect(res.body.data.map((d: { id: number }) => d.id)).toEqual([newer, older]);
    expect(res.body.data[1]).toMatchObject({
      verified: true,
      verifier: { id: ids.cse_admin, name: 'cse_admin' },
    });
  });
});

describe('PATCH /blood/donations/:id/verify (FR-BLOOD-002)', () => {
  it('verifies, syncs last_donation_date and writes the audit row', async () => {
    const id = await donate('donor', addDays(today(), -5));
    const res = await verify('cse_admin', id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ verified: true });
    expect(res.body.data.verified_at).toEqual(expect.any(String));
    expect(await lastDonation(ids.donor)).toBe(addDays(today(), -5));

    const [row] = await audits(AUDIT_ACTIONS.BLOOD_DONATION_VERIFIED, id);
    expect(row).toMatchObject({ userId: ids.cse_admin, entityType: 'blood_donation' });
    expect(row?.newValue).toMatchObject({ last_donation_date: addDays(today(), -5) });
  });

  it('keeps the latest verified date when an older donation is verified later', async () => {
    const newer = await donate('donor', addDays(today(), -3));
    const older = await donate('donor', addDays(today(), -60));
    await donate('donor', today()); // unverified: never counts
    expect((await verify('cse_admin', newer)).status).toBe(200);
    expect((await verify('super_admin', older)).status).toBe(200);
    expect(await lastDonation(ids.donor)).toBe(addDays(today(), -3));
  });

  it('hides another department’s donation from a dept_admin (404)', async () => {
    const id = await donate('donor', today());
    const res = await verify('ece_admin', id);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DONATION_NOT_FOUND');
    expect(await audits(AUDIT_ACTIONS.BLOOD_DONATION_VERIFIED, id)).toHaveLength(0);
  });

  it('refuses an admin verifying their own donation (403)', async () => {
    const id = await donate('cse_admin', today());
    const res = await verify('cse_admin', id);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CANNOT_VERIFY_OWN_DONATION');
  });

  it('lets a super_admin verify any department, then 409 on a repeat', async () => {
    const id = await donate('ece_student', today());
    expect((await verify('super_admin', id)).status).toBe(200);
    const again = await verify('cse_admin', id);
    expect(again.status).toBe(404); // ECE donation: invisible to the CSE admin
    const repeat = await verify('ece_admin', id);
    expect(repeat.status).toBe(409);
    expect(repeat.body.error.code).toBe('DONATION_ALREADY_VERIFIED');
  });

  it('refuses student, faculty and moderator with 403, and a missing id with 404', async () => {
    const id = await donate('donor', today());
    for (const who of ['donor2', 'faculty', 'moderator'] as const) {
      expect((await verify(who, id)).status).toBe(403);
    }
    expect((await verify('cse_admin', 999999)).status).toBe(404);
  });

  it('race: the same donation verified twice → one 200, one 409, one audit row', async () => {
    const id = await donate('donor', addDays(today(), -1));
    const results = await Promise.all([verify('cse_admin', id), verify('super_admin', id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await audits(AUDIT_ACTIONS.BLOOD_DONATION_VERIFIED, id)).toHaveLength(1);
  });

  it('race: two donations of one donor verified together leave the latest date', async () => {
    const a = await donate('donor', addDays(today(), -40));
    const b = await donate('donor', addDays(today(), -4));
    const results = await Promise.all([verify('cse_admin', a), verify('super_admin', b)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await lastDonation(ids.donor)).toBe(addDays(today(), -4));
  });
});

describe('GET /admin/blood/donations/unverified (FR-BLOOD-010)', () => {
  it('scopes a dept_admin to their department, oldest first', async () => {
    const late = await donate('donor', addDays(today(), -1));
    const early = await donate('donor2', addDays(today(), -9));
    const done = await donate('faculty', addDays(today(), -2));
    await donate('ece_student', today());
    await verify('cse_admin', done);

    const res = await send('cse_admin', 'get', '/api/v1/admin/blood/donations/unverified');
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { id: number }) => d.id)).toEqual([early, late]);
    expect(res.body.data[0].donor).toMatchObject({
      id: ids.donor2,
      department: { id: cse, name: 'CSE' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/email/i);

    const other = await send(
      'cse_admin',
      'get',
      `/api/v1/admin/blood/donations/unverified?department_id=${ece}`,
    );
    expect(other.status).toBe(200);
    expect(other.body.data).toEqual([]);
    expect(other.body.meta.total).toBe(0);
  });

  it('shows a super_admin every department, filterable', async () => {
    await donate('donor', today());
    const eceId = await donate('ece_student', today());
    const all = await send('super_admin', 'get', '/api/v1/admin/blood/donations/unverified');
    expect(all.body.meta.total).toBe(2);
    const filtered = await send(
      'super_admin',
      'get',
      `/api/v1/admin/blood/donations/unverified?department_id=${ece}`,
    );
    expect(filtered.body.data.map((d: { id: number }) => d.id)).toEqual([eceId]);
  });
});

describe('GET /blood/donors (FR-BLOOD-004)', () => {
  it('lists users with a donation, verified first by date, with phone and no email', async () => {
    const d1 = await donate('donor', addDays(today(), -10));
    await donate('donor2', addDays(today(), -1)); // unverified only
    const e1 = await donate('ece_student', addDays(today(), -3));
    await verify('cse_admin', d1);
    await verify('ece_admin', e1);
    // A suspended user's donation never lists them.
    await prisma.bloodDonation.create({
      data: {
        userId: suspendedId,
        bloodGroup: 'A+',
        donationDate: toDbDate(today()),
        verified: true,
        verifiedById: ids.super_admin,
        verifiedAt: new Date(),
      },
    });

    const res = await send('faculty', 'get', '/api/v1/blood/donors');
    expect(res.status).toBe(200);
    expect(res.body.data.map((d: { id: string }) => d.id)).toEqual([
      ids.ece_student,
      ids.donor,
      ids.donor2,
    ]);
    expect(res.body.data[1]).toEqual({
      id: ids.donor,
      name: 'donor',
      blood_group: 'A+',
      department: { id: cse, name: 'CSE' },
      last_donation_date: addDays(today(), -10),
      phone: '+8801700000001',
      verified: true,
    });
    expect(res.body.data[2]).toMatchObject({ verified: false, last_donation_date: null });
    expect(JSON.stringify(res.body)).not.toMatch(/email|@blood\.test/i);
  });

  it('filters by verified_only, department and blood group', async () => {
    const d1 = await donate('donor', today());
    await donate('donor2', today());
    await donate('ece_student', today());
    await verify('cse_admin', d1);
    await prisma.user.update({ where: { id: ids.donor2 }, data: { bloodGroup: 'B-' } });

    const verified = await send('donor', 'get', '/api/v1/blood/donors?verified_only=true');
    expect(verified.body.data.map((d: { id: string }) => d.id)).toEqual([ids.donor]);
    const eceDonors = await send('donor', 'get', `/api/v1/blood/donors?department_id=${ece}`);
    expect(eceDonors.body.data.map((d: { id: string }) => d.id)).toEqual([ids.ece_student]);
    const bneg = await send('donor', 'get', '/api/v1/blood/donors?blood_group=B-');
    expect(bneg.body.data.map((d: { id: string }) => d.id)).toEqual([ids.donor2]);
    await prisma.user.update({ where: { id: ids.donor2 }, data: { bloodGroup: 'A+' } });
  });
});

describe('POST and GET /blood/requests (FR-BLOOD-005, -006)', () => {
  it('creates a pending request; today is allowed, yesterday is 400', async () => {
    const res = await send(
      'super_admin',
      'post',
      '/api/v1/blood/requests',
      requestBody({ required_by_date: today() }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'pending',
      required_by_date: today(),
      requester: { id: ids.super_admin },
      can_fulfill: false,
      can_cancel: true,
    });
    expect(sentEmails).toHaveLength(0); // no donor notifications in V1 (PRD #15)

    const past = await send(
      'donor',
      'post',
      '/api/v1/blood/requests',
      requestBody({ required_by_date: addDays(today(), -1) }),
    );
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('REQUIRED_BY_DATE_PAST');
    const bad = await send('donor', 'post', '/api/v1/blood/requests', {
      ...requestBody(),
      contact_phone: 'call me',
    });
    expect(bad.status).toBe(400);
  });

  it('lists pending by default, soonest first, filterable by requester department', async () => {
    const later = await postRequest('donor', { required_by_date: addDays(today(), 5) });
    const sooner = await postRequest('ece_student', { required_by_date: addDays(today(), 1) });
    const cancelled = await postRequest('donor2');
    await send('donor2', 'patch', `/api/v1/blood/requests/${cancelled}/cancel`);

    const res = await send('faculty', 'get', '/api/v1/blood/requests');
    expect(res.body.data.map((r: { id: number }) => r.id)).toEqual([sooner, later]);
    expect(res.body.data[1]).toMatchObject({ can_fulfill: true, can_cancel: false });
    expect(JSON.stringify(res.body)).not.toMatch(/email|@blood\.test/i);

    const eceOnly = await send('faculty', 'get', `/api/v1/blood/requests?department_id=${ece}`);
    expect(eceOnly.body.data.map((r: { id: number }) => r.id)).toEqual([sooner]);
    const done = await send('faculty', 'get', '/api/v1/blood/requests?status=cancelled');
    expect(done.body.data.map((r: { id: number }) => r.id)).toEqual([cancelled]);
  });
});

describe('PATCH /blood/requests/:id/fulfill (FR-BLOOD-007)', () => {
  it('fulfills, audits, emails the requester and creates no donation', async () => {
    const id = await postRequest('donor');
    const res = await send('faculty', 'patch', `/api/v1/blood/requests/${id}/fulfill`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'fulfilled',
      fulfiller: { id: ids.faculty, name: 'faculty' },
      can_fulfill: false,
      can_cancel: false,
    });
    expect(res.body.data.resolved_at).toEqual(expect.any(String));
    expect(await audits(AUDIT_ACTIONS.BLOOD_REQUEST_FULFILLED, id)).toHaveLength(1);
    expect(await prisma.bloodDonation.count()).toBe(0);
    expect(sentEmails).toEqual([
      expect.objectContaining({
        kind: 'blood-request-fulfilled',
        to: 'donor@blood.test',
        fulfillerName: 'faculty',
      }),
    ]);
    expect(JSON.stringify(sentEmails)).not.toContain('faculty@blood.test');
  });

  it('refuses the requester (403) and a resolved request (409)', async () => {
    const id = await postRequest('donor');
    const own = await send('donor', 'patch', `/api/v1/blood/requests/${id}/fulfill`);
    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe('CANNOT_FULFILL_OWN_REQUEST');
    expect((await send('donor2', 'patch', `/api/v1/blood/requests/${id}/fulfill`)).status).toBe(
      200,
    );
    const again = await send('faculty', 'patch', `/api/v1/blood/requests/${id}/fulfill`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('BLOOD_REQUEST_NOT_PENDING');
    expect((await send('faculty', 'patch', '/api/v1/blood/requests/999999/fulfill')).status).toBe(
      404,
    );
  });

  it('race: five users fulfill one request → exactly one 200', async () => {
    const id = await postRequest('donor');
    const who: Who[] = ['donor2', 'faculty', 'moderator', 'ece_student', 'super_admin'];
    const results = await Promise.all(
      who.map((w) => send(w, 'patch', `/api/v1/blood/requests/${id}/fulfill`)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409]);
    expect(await audits(AUDIT_ACTIONS.BLOOD_REQUEST_FULFILLED, id)).toHaveLength(1);
    expect(sentEmails).toHaveLength(1);
  });
});

describe('PATCH /blood/requests/:id/cancel (FR-BLOOD-008)', () => {
  it('lets the requester cancel, with an audit row; then 409', async () => {
    const id = await postRequest('donor');
    const res = await send('donor', 'patch', `/api/v1/blood/requests/${id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'cancelled', fulfiller: null });
    expect(await audits(AUDIT_ACTIONS.BLOOD_REQUEST_CANCELLED, id)).toHaveLength(1);
    expect((await send('donor', 'patch', `/api/v1/blood/requests/${id}/cancel`)).status).toBe(409);
  });

  it("lets the requester's dept_admin and a super_admin cancel", async () => {
    const a = await postRequest('donor');
    const b = await postRequest('ece_student');
    expect((await send('cse_admin', 'patch', `/api/v1/blood/requests/${a}/cancel`)).status).toBe(
      200,
    );
    expect((await send('super_admin', 'patch', `/api/v1/blood/requests/${b}/cancel`)).status).toBe(
      200,
    );
  });

  it('refuses another department’s admin and other users with 403', async () => {
    const id = await postRequest('donor');
    for (const who of ['ece_admin', 'donor2', 'moderator', 'faculty'] as const) {
      const res = await send(who, 'patch', `/api/v1/blood/requests/${id}/cancel`);
      expect([who, res.status]).toEqual([who, 403]);
      expect(res.body.error.code).toBe('BLOOD_REQUEST_FORBIDDEN');
    }
    expect(await audits(AUDIT_ACTIONS.BLOOD_REQUEST_CANCELLED, id)).toHaveLength(0);
  });
});

describe('expire-blood-requests job (FR-BLOOD-009)', () => {
  it('expires only pending requests before today (Dhaka), once, with audit rows', async () => {
    const base = {
      requesterId: ids.donor,
      patientName: 'P',
      bloodGroup: 'O+',
      unitsNeeded: 1,
      contactPhone: '01700000000',
      hospitalName: 'H',
    };
    const past = await prisma.bloodRequest.create({
      data: { ...base, requiredByDate: toDbDate(addDays(today(), -1)) },
    });
    const due = await prisma.bloodRequest.create({
      data: { ...base, requiredByDate: toDbDate(today()) },
    });
    const done = await prisma.bloodRequest.create({
      data: {
        ...base,
        requiredByDate: toDbDate(addDays(today(), -2)),
        status: 'fulfilled',
        fulfilledById: ids.donor2,
        resolvedAt: new Date(),
      },
    });

    expect(await requestService.expireRequests()).toBe(1);
    const rows = await prisma.bloodRequest.findMany({ orderBy: { id: 'asc' } });
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      [past.id, 'expired'],
      [due.id, 'pending'],
      [done.id, 'fulfilled'],
    ]);
    expect(rows[0]?.resolvedAt).not.toBeNull();
    const [audit] = await audits(AUDIT_ACTIONS.BLOOD_REQUEST_EXPIRED, past.id);
    expect(audit).toMatchObject({ userId: null, entityType: 'blood_request' });

    expect(await requestService.expireRequests()).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { action: AUDIT_ACTIONS.BLOOD_REQUEST_EXPIRED } }),
    ).toBe(1);

    // Tomorrow (Dhaka), today's request expires too.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(await requestService.expireRequests(tomorrow)).toBe(1);
  });

  it('refuses to fulfill a request whose date passed before the job ran (409)', async () => {
    const r = await prisma.bloodRequest.create({
      data: {
        requesterId: ids.donor,
        patientName: 'P',
        bloodGroup: 'O+',
        unitsNeeded: 1,
        contactPhone: '01700000000',
        hospitalName: 'H',
        requiredByDate: toDbDate(addDays(today(), -1)),
      },
    });
    const res = await send('faculty', 'patch', `/api/v1/blood/requests/${r.id}/fulfill`);
    expect(res.status).toBe(409);
  });
});
