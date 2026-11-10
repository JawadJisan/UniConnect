import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';

/** The columns of a club summary. An allowlist: nothing else reaches the response. */
export const CLUB_SELECT = {
  id: true,
  name: true,
  description: true,
  logoUrl: true,
  membershipFeeMonthly: true,
  membershipFeeYearly: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  updatedAt: true,
} satisfies Prisma.ClubSelect;

/** Summary plus the current committee. Committee users expose id, name and avatar only. */
export const CLUB_DETAIL_SELECT = {
  ...CLUB_SELECT,
  committeeMembers: {
    where: { isCurrent: true },
    select: {
      id: true,
      position: true,
      termStartYear: true,
      termEndYear: true,
      user: { select: { id: true, name: true, image: true } },
    },
    orderBy: [{ position: 'asc' }, { user: { name: 'asc' } }, { id: 'asc' }],
  },
} satisfies Prisma.ClubSelect;

export type ClubRow = Prisma.ClubGetPayload<{ select: typeof CLUB_SELECT }>;
export type ClubDetailRow = Prisma.ClubGetPayload<{ select: typeof CLUB_DETAIL_SELECT }>;

/** Fields PATCH /clubs/:id may write, in Prisma names. */
export interface ClubUpdateData {
  name?: string;
  description?: string | null;
  logoUrl?: string;
  membershipFeeMonthly?: string | null;
  membershipFeeYearly?: string | null;
}

export const clubRepository = {
  async list(db: Db, page: number, limit: number) {
    const [rows, total] = await Promise.all([
      db.club.findMany({
        select: CLUB_SELECT,
        // id breaks ties, so a page boundary never repeats or skips a row.
        orderBy: [{ department: { name: 'asc' } }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.club.count(),
    ]);
    return { rows, total };
  },

  findDetail(db: Db, id: number) {
    return db.club.findUnique({ where: { id }, select: CLUB_DETAIL_SELECT });
  },

  findDetailByDepartment(db: Db, departmentId: number) {
    return db.club.findUnique({ where: { departmentId }, select: CLUB_DETAIL_SELECT });
  },

  async findDepartmentId(db: Db, id: number): Promise<number | null> {
    const row = await db.club.findUnique({ where: { id }, select: { departmentId: true } });
    return row?.departmentId ?? null;
  },

  /** Locks the club row until the transaction ends, so concurrent edits run one at a time. */
  async lockClub(db: Db, id: number): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM clubs WHERE id = ${id} FOR UPDATE`;
    return rows.length > 0;
  },

  findForUpdate(db: Db, id: number) {
    return db.club.findUnique({ where: { id }, select: CLUB_SELECT });
  },

  update(db: Db, id: number, data: ClubUpdateData) {
    return db.club.update({ where: { id }, data, select: CLUB_SELECT });
  },
};
