import type { MembershipStatus, MembershipType } from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { IsoDate } from '../../lib/dates.js';
import { toDbDate } from '../../lib/dates.js';
import type { Db } from '../../repositories/audit.repository.js';

/** The columns of a membership response. An allowlist: nothing else reaches the response. */
export const MEMBERSHIP_SELECT = {
  id: true,
  userId: true,
  clubId: true,
  type: true,
  status: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  club: {
    select: {
      id: true,
      name: true,
      logoUrl: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
    },
  },
  // The latest payment only. id breaks ties between rows created in the same instant.
  payments: {
    select: {
      transactionId: true,
      amount: true,
      currency: true,
      paymentStatus: true,
      validatedAt: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
  },
} satisfies Prisma.ClubMembershipSelect;

/** The admin list adds who the member is. Never the phone or anything auth-related. */
export const ADMIN_MEMBERSHIP_SELECT = {
  ...MEMBERSHIP_SELECT,
  user: { select: { id: true, name: true, email: true, studentId: true } },
} satisfies Prisma.ClubMembershipSelect;

export type MembershipRow = Prisma.ClubMembershipGetPayload<{ select: typeof MEMBERSHIP_SELECT }>;
export type AdminMembershipDbRow = Prisma.ClubMembershipGetPayload<{
  select: typeof ADMIN_MEMBERSHIP_SELECT;
}>;

/** Statuses that occupy a (user, club) pair: one active, and one pending-or-scheduled (D11). */
const OPEN_STATUSES = ['pending', 'scheduled', 'active'] as const;

export interface MembershipListFilter {
  userId?: string;
  departmentId?: number;
  clubId?: number;
  status?: MembershipStatus;
  type?: MembershipType;
}

function whereOf(f: MembershipListFilter): Prisma.ClubMembershipWhereInput {
  return {
    ...(f.userId !== undefined && { userId: f.userId }),
    ...(f.clubId !== undefined && { clubId: f.clubId }),
    ...(f.status !== undefined && { status: f.status }),
    ...(f.type !== undefined && { type: f.type }),
    ...(f.departmentId !== undefined && { club: { departmentId: f.departmentId } }),
  };
}

export const membershipRepository = {
  findById(db: Db, id: number) {
    return db.clubMembership.findUnique({ where: { id }, select: MEMBERSHIP_SELECT });
  },

  /** Locks the membership row until the transaction ends. False when it doesn't exist. */
  async lock(db: Db, id: number): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM club_memberships WHERE id = ${id} FOR UPDATE`;
    return rows.length > 0;
  },

  /** Locks the row only while it is still `pending`. False when it isn't (anymore). */
  async lockPending(db: Db, id: number): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM club_memberships WHERE id = ${id} AND status = 'pending' FOR UPDATE`;
    return rows.length > 0;
  },

  /** The club a checkout is for, with its fees. */
  findClubForCheckout(db: Db, clubId: number) {
    return db.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        departmentId: true,
        membershipFeeMonthly: true,
        membershipFeeYearly: true,
      },
    });
  },

  /** Pending, scheduled and active rows of a (user, club) pair. */
  findOpenForPair(db: Db, userId: string, clubId: number) {
    return db.clubMembership.findMany({
      where: { userId, clubId, status: { in: [...OPEN_STATUSES] } },
      select: { id: true, status: true, endDate: true, createdAt: true },
    });
  },

  /** The pair's active row other than `excludeId`, if any. */
  findActiveSibling(db: Db, userId: string, clubId: number, excludeId: number) {
    return db.clubMembership.findFirst({
      where: { userId, clubId, status: 'active', id: { not: excludeId } },
      select: { id: true, endDate: true },
    });
  },

  create(
    db: Db,
    data: { userId: string; clubId: number; type: MembershipType; start: IsoDate; end: IsoDate },
  ) {
    return db.clubMembership.create({
      data: {
        userId: data.userId,
        clubId: data.clubId,
        type: data.type,
        status: 'pending',
        startDate: toDbDate(data.start),
        endDate: toDbDate(data.end),
      },
      select: { id: true },
    });
  },

  update(db: Db, id: number, data: { status: MembershipStatus; start?: IsoDate; end?: IsoDate }) {
    return db.clubMembership.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.start !== undefined && { startDate: toDbDate(data.start) }),
        ...(data.end !== undefined && { endDate: toDbDate(data.end) }),
      },
      select: { id: true },
    });
  },

  async list(db: Db, filter: MembershipListFilter, page: number, limit: number) {
    const where = whereOf(filter);
    const [rows, total] = await Promise.all([
      db.clubMembership.findMany({
        where,
        select: MEMBERSHIP_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.clubMembership.count({ where }),
    ]);
    return { rows, total };
  },

  async adminList(db: Db, filter: MembershipListFilter, page: number, limit: number) {
    const where = whereOf(filter);
    const [rows, total] = await Promise.all([
      db.clubMembership.findMany({
        where,
        select: ADMIN_MEMBERSHIP_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.clubMembership.count({ where }),
    ]);
    return { rows, total };
  },

  // ---- Scheduled jobs. Each locks its batch with SKIP LOCKED, so two runs never collide. ----

  /** Active rows whose last day is before `today`. */
  lockExpired(db: Db, today: IsoDate, batch: number) {
    return db.$queryRaw<{ id: number }[]>`
      SELECT id FROM club_memberships
      WHERE status = 'active' AND end_date < ${today}::date
      ORDER BY id LIMIT ${batch}
      FOR UPDATE SKIP LOCKED`;
  },

  /** Scheduled renewals due by `today` whose pair has no active row left. */
  lockDueScheduled(db: Db, today: IsoDate, batch: number) {
    return db.$queryRaw<{ id: number }[]>`
      SELECT m.id FROM club_memberships m
      WHERE m.status = 'scheduled' AND m.start_date <= ${today}::date
        AND NOT EXISTS (
          SELECT 1 FROM club_memberships a
          WHERE a.user_id = m.user_id AND a.club_id = m.club_id AND a.status = 'active')
      ORDER BY m.id LIMIT ${batch}
      FOR UPDATE OF m SKIP LOCKED`;
  },

  /** Unpaid checkouts created before `cutoff`. */
  lockStalePending(db: Db, cutoff: Date, batch: number) {
    return db.$queryRaw<{ id: number }[]>`
      SELECT id FROM club_memberships
      WHERE status = 'pending' AND created_at < ${cutoff}
      ORDER BY id LIMIT ${batch}
      FOR UPDATE SKIP LOCKED`;
  },

  setStatusMany(db: Db, ids: number[], status: MembershipStatus) {
    return db.clubMembership.updateMany({ where: { id: { in: ids } }, data: { status } });
  },
};
