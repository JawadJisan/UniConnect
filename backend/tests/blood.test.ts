import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  bloodRequestListQuerySchema,
  createBloodRequestSchema,
  createDonationSchema,
  donorListQuerySchema,
} from '@uniconnect/shared';
import express from 'express';
import request from 'supertest';

// Pure rules of the blood module (PRD FR-BLOOD, DECISIONS D14, D40): request schemas, the
// cancel rule, the response mapping (no email anywhere), the Dhaka date checks and the route
// guards that run before any database call. Locks, races, the donor query and the expiry job
// run against the real database in tests/integration/blood.int.test.ts.

type SessionResult = { headers: Headers; response: unknown };
const getSession = jest.fn<(args: unknown) => Promise<SessionResult>>();

jest.unstable_mockModule('../src/lib/auth.js', () => ({ auth: { api: { getSession } } }));
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));

const { canCancelWith, toBloodRequest, toDonor, toUnverifiedDonation } =
  await import('../src/modules/blood/blood.mapper.js');
const { whereDonor } = await import('../src/modules/blood/donation.repository.js');
const { whereRequests } = await import('../src/modules/blood/request.repository.js');
const { donationService } = await import('../src/modules/blood/donation.service.js');
const { requestService } = await import('../src/modules/blood/request.service.js');
const { bloodRouter, adminBloodRouter } = await import('../src/modules/blood/blood.routes.js');
const { errorHandler } = await import('../src/middleware/error-handler.js');
const { addDays, todayInDhaka } = await import('../src/lib/dates.js');

const caller = (role: string, departmentId: number | null = 1, id = 'me') => ({
  id,
  role,
  departmentId,
  ip: null,
});

describe('createDonationSchema (FR-BLOOD-001)', () => {
  it('defaults units to 1 and drops empty optional text', () => {
    expect(
      createDonationSchema.parse({ donation_date: '2026-11-01', hospital_name: '  ', notes: '' }),
    ).toEqual({ donation_date: '2026-11-01', units: 1 });
  });

  it.each([
    ['units 0', { units: 0 }],
    ['units 5', { units: 5 }],
    ['units 1.5', { units: 1.5 }],
    ['a bad date', { donation_date: '2026-02-30' }],
    ['an unknown key', { blood_group: 'O+' }],
  ])('refuses %s', (_label, extra) => {
    expect(createDonationSchema.safeParse({ donation_date: '2026-11-01', ...extra }).success).toBe(
      false,
    );
  });
});

describe('createBloodRequestSchema (FR-BLOOD-005)', () => {
  const base = {
    patient_name: ' Rahim ',
    blood_group: 'O-',
    units_needed: 2,
    contact_phone: '+8801711111111',
    hospital_name: 'Dhaka Medical',
    required_by_date: '2026-12-01',
  };

  it('accepts a full body and trims names', () => {
    expect(createBloodRequestSchema.parse(base)).toMatchObject({ patient_name: 'Rahim' });
  });

  it.each([
    ['a bad blood group', { blood_group: 'C+' }],
    ['zero units', { units_needed: 0 }],
    ['21 units', { units_needed: 21 }],
    ['a bad phone', { contact_phone: '12ab' }],
    ['no hospital', { hospital_name: ' ' }],
    ['an unknown key', { status: 'fulfilled' }],
  ])('refuses %s', (_label, extra) => {
    expect(createBloodRequestSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
});

describe('list query schemas', () => {
  it('requests default to pending (FR-BLOOD-006)', () => {
    expect(bloodRequestListQuerySchema.parse({})).toMatchObject({ status: 'pending', page: 1 });
  });

  it('donor list parses verified_only and refuses junk', () => {
    expect(donorListQuerySchema.parse({ verified_only: 'true' }).verified_only).toBe(true);
    expect(donorListQuerySchema.safeParse({ verified_only: 'yes' }).success).toBe(false);
    expect(donorListQuerySchema.safeParse({ blood_group: 'Z' }).success).toBe(false);
  });
});

describe('query filters', () => {
  it('whereDonor: active donors with a donation, verified when asked (PRD #14)', () => {
    expect(whereDonor({ page: 1, limit: 20 })).toEqual({
      isActive: true,
      userType: { not: 'super_admin' },
      bloodDonations: { some: {} },
    });
    expect(
      whereDonor({ page: 1, limit: 20, verified_only: true, blood_group: 'B+', department_id: 2 }),
    ).toEqual({
      isActive: true,
      userType: { not: 'super_admin' },
      bloodDonations: { some: { verified: true } },
      bloodGroup: 'B+',
      departmentId: 2,
    });
  });

  it("whereRequests: department means the requester's (D40)", () => {
    expect(whereRequests({ page: 1, limit: 20, status: 'pending', department_id: 3 })).toEqual({
      status: 'pending',
      requester: { departmentId: 3 },
    });
  });
});

describe('canCancelWith (FR-BLOOD-008)', () => {
  const req = { requesterId: 'r1', requesterDepartmentId: 1 };
  it.each([
    ['the requester', caller('student', 1, 'r1'), true],
    ['a super_admin', caller('super_admin', null), true],
    ["the requester's dept_admin", caller('dept_admin', 1), true],
    ['another dept_admin', caller('dept_admin', 2), false],
    ['a moderator of the department', caller('moderator', 1), false],
    ['another student', caller('student', 1), false],
  ])('%s → %s', (_label, who, expected) => {
    expect(canCancelWith(who, req)).toBe(expected);
  });
});

const user = { id: 'u1', name: 'Karim' };
const dept = { id: 1, name: 'CSE' };

describe('mappers never include email', () => {
  it('toDonor shows phone, date and the verified badge (D14)', () => {
    const donor = toDonor(
      {
        id: 'u1',
        name: 'Karim',
        bloodGroup: 'AB+',
        lastDonationDate: new Date('2026-10-01T00:00:00.000Z'),
        phone: '+8801700000000',
        department: dept,
      },
      true,
    );
    expect(donor).toEqual({
      id: 'u1',
      name: 'Karim',
      blood_group: 'AB+',
      department: dept,
      last_donation_date: '2026-10-01',
      phone: '+8801700000000',
      verified: true,
    });
    expect(JSON.stringify(donor)).not.toMatch(/email/i);
  });

  it('toUnverifiedDonation carries the donor without email', () => {
    const row = toUnverifiedDonation({
      id: 7,
      userId: 'u1',
      bloodGroup: 'A+',
      donationDate: new Date('2026-11-01T00:00:00.000Z'),
      units: 1,
      hospitalName: null,
      notes: null,
      verified: false,
      verifiedAt: null,
      createdAt: new Date('2026-11-02T00:00:00.000Z'),
      verifier: null,
      donor: { ...user, studentId: 'S-1', department: dept },
    });
    expect(row.donor).toEqual({ ...user, student_id: 'S-1', department: dept });
    expect(row.donation_date).toBe('2026-11-01');
    expect(JSON.stringify(row)).not.toMatch(/email/i);
  });

  describe('toBloodRequest flags', () => {
    const row = (status: string) => ({
      id: 1,
      requesterId: 'r1',
      patientName: 'P',
      bloodGroup: 'O+',
      unitsNeeded: 1,
      reason: null,
      contactPhone: '01700000000',
      hospitalName: 'H',
      requiredByDate: new Date('2026-12-01T00:00:00.000Z'),
      status,
      createdAt: new Date(),
      resolvedAt: null,
      requester: { id: 'r1', name: 'Req', departmentId: 1, department: dept },
      fulfiller: null,
    });

    it('a stranger can fulfill a pending request but not cancel it', () => {
      const out = toBloodRequest(row('pending'), caller('student', 1, 'x'));
      expect(out).toMatchObject({
        can_fulfill: true,
        can_cancel: false,
        required_by_date: '2026-12-01',
      });
      expect(JSON.stringify(out)).not.toMatch(/email/i);
    });

    it('the requester can cancel but not fulfill', () => {
      expect(toBloodRequest(row('pending'), caller('student', 1, 'r1'))).toMatchObject({
        can_fulfill: false,
        can_cancel: true,
      });
    });

    it('nothing is allowed once resolved', () => {
      expect(toBloodRequest(row('fulfilled'), caller('super_admin', null))).toMatchObject({
        can_fulfill: false,
        can_cancel: false,
      });
    });
  });
});

describe('Dhaka date checks (before any database call)', () => {
  it('refuses a donation dated tomorrow (FR-BLOOD-001)', async () => {
    await expect(
      donationService.create(caller('student'), {
        donation_date: addDays(todayInDhaka(), 1),
        units: 1,
      }),
    ).rejects.toMatchObject({ status: 400, code: 'DONATION_DATE_FUTURE' });
  });

  it('refuses a request needed by yesterday (D40)', async () => {
    await expect(
      requestService.create(caller('student'), {
        patient_name: 'P',
        blood_group: 'O+',
        units_needed: 1,
        contact_phone: '01700000000',
        hospital_name: 'H',
        required_by_date: addDays(todayInDhaka(), -1),
      }),
    ).rejects.toMatchObject({ status: 400, code: 'REQUIRED_BY_DATE_PAST' });
  });
});

describe('route guards (before any database call)', () => {
  const app = express();
  app.use(express.json());
  app.use('/blood', bloodRouter);
  app.use('/admin/blood', adminBloodRouter);
  app.use(errorHandler);

  function signedIn(role: string) {
    getSession.mockResolvedValue({
      headers: new Headers(),
      response: {
        session: { id: 's1', userId: 'u1' },
        user: {
          id: 'u1',
          role,
          userType: role === 'super_admin' ? 'super_admin' : 'student',
          departmentId: role === 'super_admin' ? null : 1,
          isActive: true,
        },
      },
    });
  }

  beforeEach(() => {
    getSession.mockReset().mockResolvedValue({ headers: new Headers(), response: null });
  });

  it('returns 401 without a session on every route', async () => {
    const calls = [
      request(app).post('/blood/donations').send({ donation_date: '2026-11-01' }),
      request(app).get('/blood/donations/my'),
      request(app).patch('/blood/donations/1/verify'),
      request(app).get('/blood/donors'),
      request(app).post('/blood/requests').send({}),
      request(app).get('/blood/requests'),
      request(app).patch('/blood/requests/1/fulfill'),
      request(app).patch('/blood/requests/1/cancel'),
      request(app).get('/admin/blood/donations/unverified'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('refuses a super_admin on donation create and history (FR-BLOOD-001, -003)', async () => {
    signedIn('super_admin');
    const calls = [
      request(app).post('/blood/donations').send({ donation_date: '2026-11-01' }),
      request(app).get('/blood/donations/my'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
  });

  it.each(['student', 'faculty', 'moderator'])(
    'refuses a %s on verify and the unverified list with 403',
    async (role) => {
      signedIn(role);
      const calls = [
        request(app).patch('/blood/donations/1/verify'),
        request(app).get('/admin/blood/donations/unverified'),
      ];
      for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
    },
  );

  it('returns 400 for a bad body, id or query', async () => {
    signedIn('dept_admin');
    const bad = await Promise.all([
      request(app).post('/blood/donations').send({ donation_date: 'yesterday' }),
      request(app).post('/blood/requests').send({ patient_name: 'P' }),
      request(app).patch('/blood/donations/abc/verify'),
      request(app).patch('/blood/requests/0/fulfill'),
      request(app).get('/blood/requests?status=open'),
      request(app).get('/blood/donors?verified_only=1'),
      request(app).get('/admin/blood/donations/unverified?department_id=x'),
    ]);
    for (const res of bad) expect(res.status).toBe(400);
  });
});
