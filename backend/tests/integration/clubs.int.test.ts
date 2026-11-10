import {
  ORIGIN,
  clubFor,
  createUser,
  departmentId,
  loadHarness,
  resetDatabase,
  signInCookie,
} from './harness.js';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AUDIT_ACTIONS, type Role } from '@uniconnect/shared';
import request from 'supertest';

// /api/v1/clubs (PRD FR-CLUB-001–004, DECISIONS D31) against the real database. Cloudinary is
// mocked at its client module; nothing reaches the real service.
const uploadClubLogo = jest.fn<(clubId: number, buffer: Buffer) => Promise<string>>();
jest.unstable_mockModule('../../src/lib/cloudinary.js', () => ({
  uploadAvatar: jest.fn(),
  uploadClubLogo,
}));

const h = await loadHarness();
const { app, prisma } = h;

const LOGO_URL = 'https://res.cloudinary.com/demo/image/upload/v7/uniconnect/club-logos/c.png';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
]);

let cse: number;
let ece: number;
let bba: number;
let cseClub: number;
let eceClub: number;
type Who =
  'student' | 'faculty' | 'moderator' | 'dept_admin' | 'super_admin' | 'ece_admin' | 'ece_student';
const ids = {} as Record<Who, string>;
const cookies = {} as Record<Who, string>;

// One account per role in CSE, plus a dept_admin and a student in ECE. Roles are written
// directly, as in the RBAC matrix; term endpoints don't exist yet.
const ACCOUNTS: {
  key: Who;
  role: Role;
  userType: 'student' | 'faculty' | 'super_admin';
  dept: 'CSE' | 'ECE';
}[] = [
  { key: 'student', role: 'student', userType: 'student', dept: 'CSE' },
  { key: 'faculty', role: 'faculty', userType: 'faculty', dept: 'CSE' },
  { key: 'moderator', role: 'moderator', userType: 'student', dept: 'CSE' },
  { key: 'dept_admin', role: 'dept_admin', userType: 'faculty', dept: 'CSE' },
  { key: 'super_admin', role: 'super_admin', userType: 'super_admin', dept: 'CSE' },
  { key: 'ece_admin', role: 'dept_admin', userType: 'faculty', dept: 'ECE' },
  { key: 'ece_student', role: 'student', userType: 'student', dept: 'ECE' },
];

beforeAll(async () => {
  await resetDatabase(h);
  cse = await departmentId(h, 'CSE');
  ece = await departmentId(h, 'ECE');
  bba = await departmentId(h, 'BBA');
  for (const a of ACCOUNTS) {
    const email = `${a.key}@clubs.test`;
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
  cseClub = await clubFor(h, 'CSE', {
    description: 'Computing club',
    membershipFeeMonthly: '100.00',
  });
  eceClub = await clubFor(h, 'ECE');
  await clubFor(h, 'BBA');
  await prisma.clubCommitteeMember.deleteMany();
  await prisma.auditLog.deleteMany({
    where: { action: { in: [AUDIT_ACTIONS.CLUB_UPDATED, AUDIT_ACTIONS.CLUB_LOGO_UPDATED] } },
  });
  uploadClubLogo.mockReset();
  uploadClubLogo.mockResolvedValue(LOGO_URL);
});

const get = (path: string, who?: Who) => {
  const req = request(app).get(path).set('Origin', ORIGIN);
  return who ? req.set('Cookie', cookies[who]) : req;
};
const patch = (path: string, who: Who, body: object) =>
  request(app).patch(path).set('Origin', ORIGIN).set('Cookie', cookies[who]).send(body);
const upload = (id: number, who: Who, file = PNG, name = 'logo.png') =>
  request(app)
    .patch(`/api/v1/clubs/${id}/logo`)
    .set('Origin', ORIGIN)
    .set('Cookie', cookies[who])
    .attach('logo', file, { filename: name, contentType: 'image/png' });

const clubAudits = (action: string) =>
  prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

describe('GET /api/v1/clubs', () => {
  it('returns 401 without a session', async () => {
    expect((await get('/api/v1/clubs')).status).toBe(401);
  });

  it.each<Who>(['student', 'faculty', 'moderator', 'dept_admin', 'super_admin'])(
    'lists every club for %s, with department names and string fees',
    async (who) => {
      const res = await get('/api/v1/clubs', who);
      expect(res.status).toBe(200);
      expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 3, total_pages: 1 });
      expect(res.body.data.map((c: { department: { name: string } }) => c.department.name)).toEqual(
        ['BBA', 'CSE', 'ECE'],
      );
      const cseRow = res.body.data.find((c: { id: number }) => c.id === cseClub);
      expect(cseRow).toEqual({
        id: cseClub,
        name: 'CSE Club',
        description: 'Computing club',
        logo_url: null,
        membership_fee_monthly: '100.00',
        membership_fee_yearly: null,
        department: { id: cse, name: 'CSE' },
        updated_at: expect.any(String),
      });
    },
  );

  it('paginates', async () => {
    const res = await get('/api/v1/clubs?page=2&limit=2', 'student');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 3, total_pages: 2 });
  });

  it('rejects unknown query keys and a limit over 100', async () => {
    expect((await get('/api/v1/clubs?sort=name', 'student')).status).toBe(400);
    expect((await get('/api/v1/clubs?limit=101', 'student')).status).toBe(400);
  });
});

describe('GET /api/v1/clubs/:id', () => {
  it('returns 401 without a session', async () => {
    expect((await get(`/api/v1/clubs/${cseClub}`)).status).toBe(401);
  });

  it('returns the club with its current committee only, and no contact details', async () => {
    await prisma.clubCommitteeMember.createMany({
      data: [
        {
          userId: ids.moderator,
          clubId: cseClub,
          position: 'President',
          termStartYear: 2026,
          termEndYear: 2027,
        },
        {
          userId: ids.student,
          clubId: cseClub,
          position: 'Secretary',
          termStartYear: 2025,
          termEndYear: 2026,
          isCurrent: false,
        },
      ],
    });

    const res = await get(`/api/v1/clubs/${cseClub}`, 'ece_student');

    expect(res.status).toBe(200);
    expect(res.body.data.department).toEqual({ id: cse, name: 'CSE' });
    expect(res.body.data.committee).toEqual([
      {
        id: expect.any(Number),
        position: 'President',
        term_start_year: 2026,
        term_end_year: 2027,
        user: { id: ids.moderator, name: 'User moderator', avatar_url: null },
      },
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/@clubs\.test|email|phone/);
  });

  it('returns 404 for an unknown club and 400 for a bad id', async () => {
    const missing = await get('/api/v1/clubs/999999', 'student');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('CLUB_NOT_FOUND');
    expect((await get('/api/v1/clubs/abc', 'student')).status).toBe(400);
    expect((await get('/api/v1/clubs/0', 'student')).status).toBe(400);
  });
});

describe('GET /api/v1/clubs/my-club', () => {
  it('returns 401 without a session', async () => {
    expect((await get('/api/v1/clubs/my-club')).status).toBe(401);
  });

  it.each<[Who, string]>([
    ['student', 'CSE'],
    ['faculty', 'CSE'],
    ['ece_student', 'ECE'],
  ])('resolves %s to the %s club', async (who, dept) => {
    const res = await get('/api/v1/clubs/my-club', who);
    expect(res.status).toBe(200);
    expect(res.body.data.department.name).toBe(dept);
    expect(res.body.data.committee).toEqual([]);
  });

  it('answers 404 NO_DEPARTMENT_CLUB for a super admin, pointing to GET /clubs', async () => {
    const res = await get('/api/v1/clubs/my-club', 'super_admin');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_DEPARTMENT_CLUB');
    expect(res.body.error.message).toContain('/api/v1/clubs');
  });

  it("answers 404 CLUB_NOT_FOUND when the caller's department has no club", async () => {
    const email = 'bba@clubs.test';
    await createUser(h, { email, userType: 'student', departmentId: bba });
    const cookie = await signInCookie(h, email);
    await prisma.club.deleteMany({ where: { departmentId: bba } });

    const res = await request(app)
      .get('/api/v1/clubs/my-club')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CLUB_NOT_FOUND');
  });
});

describe('PATCH /api/v1/clubs/:id', () => {
  it('returns 401 without a session', async () => {
    const res = await request(app)
      .patch(`/api/v1/clubs/${cseClub}`)
      .set('Origin', ORIGIN)
      .send({ name: 'X Club' });
    expect(res.status).toBe(401);
  });

  it("lets the club's own dept_admin edit it, auditing old and new fees", async () => {
    const res = await patch(`/api/v1/clubs/${cseClub}`, 'dept_admin', {
      name: '  CSE Society ',
      membership_fee_monthly: 150,
      membership_fee_yearly: '1500.5',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: cseClub,
      name: 'CSE Society',
      description: 'Computing club',
      membership_fee_monthly: '150.00',
      membership_fee_yearly: '1500.50',
      committee: [],
    });

    const audits = await clubAudits(AUDIT_ACTIONS.CLUB_UPDATED);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      userId: ids.dept_admin,
      entityType: 'club',
      entityId: String(cseClub),
      oldValue: { name: 'CSE Club', membership_fee_monthly: '100.00', membership_fee_yearly: null },
      newValue: {
        name: 'CSE Society',
        membership_fee_monthly: '150.00',
        membership_fee_yearly: '1500.50',
      },
    });
  });

  it('lets a super admin edit any club, and null clears a field', async () => {
    const res = await patch(`/api/v1/clubs/${eceClub}`, 'super_admin', {
      description: 'Electronics',
      membership_fee_monthly: null,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('Electronics');

    const cleared = await patch(`/api/v1/clubs/${cseClub}`, 'super_admin', {
      description: null,
      membership_fee_monthly: null,
    });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toMatchObject({ description: null, membership_fee_monthly: null });
  });

  it('writes nothing when no value changes', async () => {
    const res = await patch(`/api/v1/clubs/${cseClub}`, 'dept_admin', {
      name: 'CSE Club',
      membership_fee_monthly: '100',
    });
    expect(res.status).toBe(200);
    expect(await clubAudits(AUDIT_ACTIONS.CLUB_UPDATED)).toHaveLength(0);
  });

  it.each<Who>(['student', 'faculty', 'moderator'])('returns 403 for %s', async (who) => {
    const res = await patch(`/api/v1/clubs/${cseClub}`, who, { name: 'Taken Over' });
    expect(res.status).toBe(403);
  });

  it('returns 403 for a dept_admin of another department, and leaves the club as it was', async () => {
    const res = await patch(`/api/v1/clubs/${cseClub}`, 'ece_admin', { name: 'Taken Over' });
    expect(res.status).toBe(403);
    const club = await prisma.club.findUniqueOrThrow({ where: { id: cseClub } });
    expect(club.name).toBe('CSE Club');
    expect(await clubAudits(AUDIT_ACTIONS.CLUB_UPDATED)).toHaveLength(0);
  });

  it('returns 404 for an unknown club', async () => {
    expect(
      (await patch('/api/v1/clubs/999999', 'super_admin', { name: 'Ghost Club' })).status,
    ).toBe(404);
    expect((await patch('/api/v1/clubs/999999', 'dept_admin', { name: 'Ghost Club' })).status).toBe(
      404,
    );
  });

  it.each([
    ['logo_url', { logo_url: 'https://evil.example/x.png' }],
    ['an unknown key', { department_id: 2 }],
    ['an empty body', {}],
    ['a negative fee', { membership_fee_monthly: -1 }],
    ['three decimal places', { membership_fee_yearly: '10.005' }],
    ['a fee over DECIMAL(10,2)', { membership_fee_yearly: '123456789' }],
    ['a non-numeric fee', { membership_fee_monthly: 'free' }],
    ['a one-letter name', { name: 'X' }],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await patch(`/api/v1/clubs/${cseClub}`, 'dept_admin', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('is backed by the fee CHECK constraints in the database', async () => {
    await expect(
      prisma.club.update({ where: { id: cseClub }, data: { membershipFeeMonthly: '-1.00' } }),
    ).rejects.toThrow(/clubs_fee_monthly_non_negative/);
    await expect(
      prisma.club.update({ where: { id: cseClub }, data: { membershipFeeYearly: '-1.00' } }),
    ).rejects.toThrow(/clubs_fee_yearly_non_negative/);
  });

  it('serializes concurrent edits: both apply and both are audited', async () => {
    const [a, b] = await Promise.all([
      patch(`/api/v1/clubs/${cseClub}`, 'dept_admin', { membership_fee_monthly: '200' }),
      patch(`/api/v1/clubs/${cseClub}`, 'super_admin', { membership_fee_monthly: '300' }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const audits = await clubAudits(AUDIT_ACTIONS.CLUB_UPDATED);
    expect(audits).toHaveLength(2);
    // Each edit saw the other's committed value, never the same stale "before".
    const olds = audits.map(
      (r) => (r.oldValue as { membership_fee_monthly: string }).membership_fee_monthly,
    );
    expect(olds).toContain('100.00');
    expect(olds.filter((v) => v === '100.00')).toHaveLength(1);
  });
});

describe('PATCH /api/v1/clubs/:id/logo', () => {
  it('uploads the logo, stores the Cloudinary URL and audits it', async () => {
    const res = await upload(cseClub, 'dept_admin');

    expect(res.status).toBe(200);
    expect(res.body.data.logo_url).toBe(LOGO_URL);
    expect(uploadClubLogo).toHaveBeenCalledWith(cseClub, expect.any(Buffer));
    const audits = await clubAudits(AUDIT_ACTIONS.CLUB_LOGO_UPDATED);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      userId: ids.dept_admin,
      entityId: String(cseClub),
      oldValue: { logo_url: null },
      newValue: { logo_url: LOGO_URL },
    });
  });

  it('lets a super admin upload for any club', async () => {
    expect((await upload(eceClub, 'super_admin')).status).toBe(200);
  });

  it.each<Who>(['student', 'faculty', 'moderator', 'ece_admin'])(
    'returns 403 for %s, before uploading',
    async (who) => {
      const res = await upload(cseClub, who);
      expect(res.status).toBe(403);
      expect(uploadClubLogo).not.toHaveBeenCalled();
    },
  );

  it('returns 400 when the bytes are not an allowed image', async () => {
    const res = await upload(cseClub, 'dept_admin', Buffer.from('not really a png at all'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(uploadClubLogo).not.toHaveBeenCalled();
  });

  it('returns 400 for a disallowed type and for a missing file', async () => {
    const gif = await request(app)
      .patch(`/api/v1/clubs/${cseClub}/logo`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookies.dept_admin)
      .attach('logo', Buffer.from('GIF89a'), { filename: 'a.gif', contentType: 'image/gif' });
    expect(gif.status).toBe(400);
    expect(gif.body.error.code).toBe('INVALID_FILE_TYPE');

    const json = await patch(`/api/v1/clubs/${cseClub}/logo`, 'dept_admin', { logo_url: LOGO_URL });
    expect(json.status).toBe(400);
    expect(json.body.error.code).toBe('FILE_REQUIRED');
  });

  it('returns 404 for an unknown club', async () => {
    expect((await upload(999999, 'super_admin')).status).toBe(404);
  });

  it('keeps the old logo when the upload fails', async () => {
    const { AppError } = await import('../../src/lib/http-error.js');
    uploadClubLogo.mockRejectedValue(new AppError(502, 'UPLOAD_FAILED', 'nope'));
    const res = await upload(cseClub, 'dept_admin');
    expect(res.status).toBe(502);
    const club = await prisma.club.findUniqueOrThrow({ where: { id: cseClub } });
    expect(club.logoUrl).toBeNull();
    expect(await clubAudits(AUDIT_ACTIONS.CLUB_LOGO_UPDATED)).toHaveLength(0);
  });
});
