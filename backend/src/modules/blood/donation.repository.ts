import type { DonorListQuery } from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';

export const DONATION_SELECT = {
  id: true,
  userId: true,
  bloodGroup: true,
  donationDate: true,
  units: true,
  hospitalName: true,
  notes: true,
  verified: true,
  verifiedAt: true,
  createdAt: true,
  // Name only: never the verifier's email.
  verifier: { select: { id: true, name: true } },
} satisfies Prisma.BloodDonationSelect;

export type DonationRow = Prisma.BloodDonationGetPayload<{ select: typeof DONATION_SELECT }>;

export const UNVERIFIED_SELECT = {
  ...DONATION_SELECT,
  donor: {
    select: {
      id: true,
      name: true,
      studentId: true,
      department: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.BloodDonationSelect;

export type UnverifiedRow = Prisma.BloodDonationGetPayload<{ select: typeof UNVERIFIED_SELECT }>;

/** Directory columns (FR-BLOOD-004). Email is deliberately absent (D14). */
export const DONOR_SELECT = {
  id: true,
  name: true,
  bloodGroup: true,
  lastDonationDate: true,
  phone: true,
  department: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export type DonorRow = Prisma.UserGetPayload<{ select: typeof DONOR_SELECT }>;

/**
 * Who appears in the directory: active, non-super-admin users who recorded at least one
 * donation (PRD #14: a donation record is consent). `verified_only` needs a verified one.
 */
export function whereDonor(q: DonorListQuery): Prisma.UserWhereInput {
  return {
    isActive: true,
    userType: { not: 'super_admin' },
    bloodDonations: { some: q.verified_only ? { verified: true } : {} },
    ...(q.blood_group !== undefined ? { bloodGroup: q.blood_group } : {}),
    ...(q.department_id !== undefined ? { departmentId: q.department_id } : {}),
  };
}

export const donationRepository = {
  create(db: Db, data: Prisma.BloodDonationUncheckedCreateInput) {
    return db.bloodDonation.create({ data, select: DONATION_SELECT });
  },

  findDonorFacts(db: Db, id: number) {
    return db.bloodDonation.findUnique({
      where: { id },
      select: { id: true, userId: true, donor: { select: { departmentId: true } } },
    });
  },

  /** Locks the donation row; returns its verified flag, or null if it is gone. */
  async lock(db: Db, id: number): Promise<{ verified: boolean } | null> {
    const rows = await db.$queryRaw<{ verified: boolean }[]>`
      SELECT verified FROM blood_donations WHERE id = ${id} FOR UPDATE`;
    return rows[0] ?? null;
  },

  markVerified(db: Db, id: number, verifierId: string, at: Date) {
    return db.bloodDonation.update({
      where: { id },
      data: { verified: true, verifiedById: verifierId, verifiedAt: at },
      select: DONATION_SELECT,
    });
  },

  /** The latest verified donation date, or null. */
  async latestVerifiedDate(db: Db, userId: string): Promise<Date | null> {
    const agg = await db.bloodDonation.aggregate({
      where: { userId, verified: true },
      _max: { donationDate: true },
    });
    return agg._max.donationDate;
  },

  findUserBlood(db: Db, userId: string) {
    return db.user.findUnique({
      where: { id: userId },
      select: { bloodGroup: true, lastDonationDate: true },
    });
  },

  setLastDonationDate(db: Db, userId: string, date: Date | null) {
    return db.user.update({ where: { id: userId }, data: { lastDonationDate: date } });
  },

  listMine(db: Db, userId: string, skip: number, take: number) {
    return db.bloodDonation.findMany({
      where: { userId },
      select: DONATION_SELECT,
      orderBy: [{ donationDate: 'desc' }, { id: 'desc' }],
      skip,
      take,
    });
  },

  countMine(db: Db, userId: string) {
    return db.bloodDonation.count({ where: { userId } });
  },

  listUnverified(db: Db, where: Prisma.BloodDonationWhereInput, skip: number, take: number) {
    return db.bloodDonation.findMany({
      where,
      select: UNVERIFIED_SELECT,
      orderBy: [{ donationDate: 'asc' }, { id: 'asc' }],
      skip,
      take,
    });
  },

  countUnverified(db: Db, where: Prisma.BloodDonationWhereInput) {
    return db.bloodDonation.count({ where });
  },

  /** Donors who verified at least once, among the given ids (for the `verified` badge). */
  async verifiedDonorIds(db: Db, userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await db.bloodDonation.findMany({
      where: { userId: { in: userIds }, verified: true },
      select: { userId: true },
      distinct: ['userId'],
    });
    return new Set(rows.map((r) => r.userId));
  },

  listDonors(db: Db, where: Prisma.UserWhereInput, skip: number, take: number) {
    return db.user.findMany({
      where,
      select: DONOR_SELECT,
      orderBy: [
        { lastDonationDate: { sort: 'desc', nulls: 'last' } },
        { name: 'asc' },
        { id: 'asc' },
      ],
      skip,
      take,
    });
  },

  countDonors(db: Db, where: Prisma.UserWhereInput) {
    return db.user.count({ where });
  },
};
