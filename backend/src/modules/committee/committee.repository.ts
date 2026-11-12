import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';

/** The columns of a committee row in a response. Users expose id, name and avatar only. */
export const COMMITTEE_SELECT = {
  id: true,
  clubId: true,
  userId: true,
  position: true,
  termStartYear: true,
  termEndYear: true,
  isCurrent: true,
  updatedAt: true,
  user: { select: { id: true, name: true, image: true } },
} satisfies Prisma.ClubCommitteeMemberSelect;

export type CommitteeRow = Prisma.ClubCommitteeMemberGetPayload<{
  select: typeof COMMITTEE_SELECT;
}>;

/** Fields PATCH /clubs/:id/committee/:memberId may write, in Prisma names. */
export interface CommitteeUpdateData {
  position?: string;
  termStartYear?: number;
  termEndYear?: number;
}

export const committeeRepository = {
  async list(db: Db, clubId: number, isCurrent: boolean | undefined, page: number, limit: number) {
    const where: Prisma.ClubCommitteeMemberWhereInput = {
      clubId,
      ...(isCurrent === undefined ? {} : { isCurrent }),
    };
    const [rows, total] = await Promise.all([
      db.clubCommitteeMember.findMany({
        where,
        select: COMMITTEE_SELECT,
        // Current rows first, then the newest terms; id breaks ties so pages never overlap.
        orderBy: [
          { isCurrent: 'desc' },
          { termEndYear: 'desc' },
          { position: 'asc' },
          { id: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.clubCommitteeMember.count({ where }),
    ]);
    return { rows, total };
  },

  findById(db: Db, id: number) {
    return db.clubCommitteeMember.findUnique({ where: { id }, select: COMMITTEE_SELECT });
  },

  /** Locks the committee row until the transaction ends. False when it doesn't exist. */
  async lockMember(db: Db, id: number): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM club_committee_members WHERE id = ${id} FOR UPDATE`;
    return rows.length > 0;
  },

  /** What assignment needs to know about the target user. */
  findUserForAssignment(db: Db, userId: string) {
    return db.user.findUnique({
      where: { id: userId },
      select: { id: true, userType: true, departmentId: true, isActive: true },
    });
  },

  async hasCurrentPosition(db: Db, userId: string, clubId: number) {
    return (await db.clubCommitteeMember.count({ where: { userId, clubId, isCurrent: true } })) > 0;
  },

  /**
   * Active students and faculty of `departmentId` whose name or student ID contains `search`
   * (case-insensitive), with whether they hold a current seat in `clubId`. No email or phone.
   */
  findCandidates(db: Db, departmentId: number, clubId: number, search: string, take: number) {
    return db.user.findMany({
      where: {
        departmentId,
        isActive: true,
        userType: { in: ['student', 'faculty'] },
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { studentId: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        image: true,
        userType: true,
        studentId: true,
        committeePositions: { where: { clubId, isCurrent: true }, select: { id: true }, take: 1 },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take,
    });
  },

  insert(db: Db, data: Prisma.ClubCommitteeMemberUncheckedCreateInput) {
    return db.clubCommitteeMember.create({ data, select: COMMITTEE_SELECT });
  },

  update(db: Db, id: number, data: CommitteeUpdateData) {
    return db.clubCommitteeMember.update({ where: { id }, data, select: COMMITTEE_SELECT });
  },

  setNotCurrent(db: Db, id: number) {
    return db.clubCommitteeMember.update({
      where: { id },
      data: { isCurrent: false },
      select: { id: true },
    });
  },

  /**
   * Ids (> `afterId`, ascending) of current rows whose last term year is before `year`. Not
   * locked: the job locks and re-checks each row in its own transaction.
   */
  async findExpiredIds(db: Db, year: number, afterId: number, take: number): Promise<number[]> {
    const rows = await db.clubCommitteeMember.findMany({
      where: { isCurrent: true, termEndYear: { lt: year }, id: { gt: afterId } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take,
    });
    return rows.map((r) => r.id);
  },
};
