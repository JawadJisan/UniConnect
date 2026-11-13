import type { AnnouncementListQuery } from '@uniconnect/shared';
import { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';
import type { VisibleScope } from './announcement.access.js';

const ANNOUNCEMENT_SELECT = {
  id: true,
  title: true,
  content: true,
  isPinned: true,
  createdAt: true,
  updatedAt: true,
  clubId: true,
  departmentId: true,
  authorId: true,
  club: { select: { id: true, name: true, departmentId: true } },
  department: { select: { id: true, name: true } },
  // Name only: the author's email never leaves the API (D38).
  author: { select: { id: true, name: true } },
} satisfies Prisma.AnnouncementSelect;

export type AnnouncementRow = Prisma.AnnouncementGetPayload<{
  select: typeof ANNOUNCEMENT_SELECT;
}>;

/** Pinned first, then newest; id breaks ties so pages never overlap. */
const FEED_ORDER: Prisma.AnnouncementOrderByWithRelationInput[] = [
  { isPinned: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
];

/** The D15 visibility filter, narrowed by the query's optional filters. */
export function whereVisible(
  scope: VisibleScope,
  q: Pick<AnnouncementListQuery, 'club_id' | 'department_id' | 'is_pinned'>,
): Prisma.AnnouncementWhereInput {
  const and: Prisma.AnnouncementWhereInput[] = [];
  if (!scope.all) {
    and.push({
      OR: [
        { departmentId: { in: [...scope.departmentIds] } },
        { clubId: { in: [...scope.clubIds] } },
      ],
    });
  }
  if (q.club_id !== undefined) and.push({ clubId: q.club_id });
  if (q.department_id !== undefined) and.push({ departmentId: q.department_id });
  if (q.is_pinned !== undefined) and.push({ isPinned: q.is_pinned });
  return { AND: and };
}

export const announcementRepository = {
  findById(db: Db, id: number) {
    return db.announcement.findUnique({ where: { id }, select: ANNOUNCEMENT_SELECT });
  },

  /** Locks the row for the rest of the transaction, so edit, delete and pin run in turn. */
  async lock(db: Db, id: number): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM announcements WHERE id = ${id} FOR UPDATE`;
    return rows.length > 0;
  },

  list(db: Db, where: Prisma.AnnouncementWhereInput, skip: number, take: number) {
    return db.announcement.findMany({
      where,
      select: ANNOUNCEMENT_SELECT,
      orderBy: FEED_ORDER,
      skip,
      take,
    });
  },

  count(db: Db, where: Prisma.AnnouncementWhereInput) {
    return db.announcement.count({ where });
  },

  findClub(db: Db, id: number) {
    return db.club.findUnique({ where: { id }, select: { id: true, departmentId: true } });
  },

  findDepartment(db: Db, id: number) {
    return db.department.findUnique({ where: { id }, select: { id: true } });
  },

  create(db: Db, data: Prisma.AnnouncementUncheckedCreateInput) {
    return db.announcement.create({ data, select: ANNOUNCEMENT_SELECT });
  },

  update(db: Db, id: number, data: { title?: string; content?: string }) {
    return db.announcement.update({ where: { id }, data, select: ANNOUNCEMENT_SELECT });
  },

  delete(db: Db, id: number) {
    return db.announcement.delete({ where: { id }, select: { id: true } });
  },

  /** Flips `is_pinned` in one statement and returns the new value. */
  async togglePin(db: Db, id: number): Promise<boolean> {
    const rows = await db.$queryRaw<{ is_pinned: boolean }[]>`
      UPDATE announcements SET is_pinned = NOT is_pinned WHERE id = ${id} RETURNING is_pinned`;
    return rows[0]!.is_pinned;
  },
};
