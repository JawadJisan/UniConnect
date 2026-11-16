import { describe, expect, it, jest } from '@jest/globals';
import { clubIdParamSchema, clubListQuerySchema, updateClubSchema } from '@uniconnect/shared';

// Pure rules of the clubs module: request schemas and the row → API mapping. Routes, guards,
// the row lock and the audit rows run against the real database in
// tests/integration/clubs.int.test.ts.

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));
jest.unstable_mockModule('../src/lib/cloudinary.js', () => ({
  uploadAvatar: jest.fn(),
  uploadClubLogo: jest.fn(),
  uploadEventPoster: jest.fn(),
}));

const { Prisma } = await import('../src/generated/prisma/client.js');
const { toClub, toClubDetail } = await import('../src/modules/clubs/club.service.js');

describe('updateClubSchema', () => {
  it.each([
    [0, '0.00'],
    [150, '150.00'],
    [99.5, '99.50'],
    ['1500.5', '1500.50'],
    [' 007.25 ', '7.25'],
    ['99999999.99', '99999999.99'],
  ])('normalizes the fee %p to %p', (input, expected) => {
    const result = updateClubSchema.parse({ membership_fee_monthly: input });
    expect(result.membership_fee_monthly).toBe(expected);
  });

  it.each([-1, '-1', '1.005', '123456789', 'free', '', '1e3', Number.NaN])(
    'rejects the fee %p',
    (input) => {
      expect(updateClubSchema.safeParse({ membership_fee_yearly: input }).success).toBe(false);
    },
  );

  it('accepts null to clear a fee or the description', () => {
    expect(updateClubSchema.parse({ membership_fee_yearly: null, description: null })).toEqual({
      membership_fee_yearly: null,
      description: null,
    });
  });

  it('trims the name and description', () => {
    expect(updateClubSchema.parse({ name: '  CSE Club ', description: ' Hi ' })).toEqual({
      name: 'CSE Club',
      description: 'Hi',
    });
  });

  it('rejects logo_url and other unknown keys (DECISIONS D31)', () => {
    expect(updateClubSchema.safeParse({ logo_url: 'https://x.test/a.png' }).success).toBe(false);
    expect(updateClubSchema.safeParse({ name: 'CSE Club', department_id: 2 }).success).toBe(false);
  });

  it('rejects an empty body and out-of-range names', () => {
    expect(updateClubSchema.safeParse({}).success).toBe(false);
    expect(updateClubSchema.safeParse({ name: 'X' }).success).toBe(false);
    expect(updateClubSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
    expect(updateClubSchema.safeParse({ description: 'x'.repeat(2001) }).success).toBe(false);
  });
});

describe('club params and query', () => {
  it('coerces a positive integer id and rejects anything else', () => {
    expect(clubIdParamSchema.parse({ id: '12' })).toEqual({ id: 12 });
    for (const id of ['0', '-1', '1.5', 'abc', 'my-club']) {
      expect(clubIdParamSchema.safeParse({ id }).success).toBe(false);
    }
  });

  it('defaults page and limit and rejects unknown keys', () => {
    expect(clubListQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(clubListQuerySchema.safeParse({ sort: 'name' }).success).toBe(false);
  });
});

describe('toClub / toClubDetail', () => {
  const NOW = new Date('2026-11-10T10:00:00.000Z');
  const row = {
    id: 3,
    name: 'CSE Club',
    description: null,
    logoUrl: null,
    membershipFeeMonthly: new Prisma.Decimal('500'),
    membershipFeeYearly: null,
    departmentId: 1,
    department: { id: 1, name: 'CSE' },
    updatedAt: NOW,
  };

  it('serializes fees as 2-decimal strings and drops departmentId', () => {
    expect(toClub(row)).toEqual({
      id: 3,
      name: 'CSE Club',
      description: null,
      logo_url: null,
      membership_fee_monthly: '500.00',
      membership_fee_yearly: null,
      department: { id: 1, name: 'CSE' },
      updated_at: NOW.toISOString(),
    });
  });

  it('maps committee rows to id, name and avatar only', () => {
    const detail = toClubDetail({
      ...row,
      committeeMembers: [
        {
          id: 9,
          position: 'President',
          termStartYear: 2026,
          termEndYear: 2027,
          user: { id: 'u1', name: 'Ayesha', image: 'https://img.test/a.png' },
        },
      ],
    });
    expect(detail.committee).toEqual([
      {
        id: 9,
        position: 'President',
        term_start_year: 2026,
        term_end_year: 2027,
        user: { id: 'u1', name: 'Ayesha', avatar_url: 'https://img.test/a.png' },
      },
    ]);
  });
});
