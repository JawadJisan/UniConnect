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

/**
 * The D15 visibility filter, narrowed by the query's optional filters. `visibleSql` below is
 * the same rule in SQL, for the chatbot's full-text search; change both together.
 */
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

/** One announcement as the chatbot's retrieval reads it (DECISIONS D44). */
export interface AnnouncementHit {
  id: number;
  title: string;
  content: string;
  club_name: string | null;
  department_name: string | null;
  created_at: Date;
  rank: number;
}

/** The exact announcements_fts expression, or the GIN index is skipped. */
const ANNOUNCEMENT_FTS = Prisma.sql`to_tsvector('simple', a.title || ' ' || a.content)`;

/**
 * The D15 scope as SQL over `a`. Must match `whereVisible` above; the chatbot integration
 * tests check both against the same rows.
 */
function visibleSql(scope: VisibleScope): Prisma.Sql {
  if (scope.all) return Prisma.sql`TRUE`;
  return Prisma.sql`(a.department_id = ANY(${[...scope.departmentIds]}::int[])
    OR a.club_id = ANY(${[...scope.clubIds]}::int[]))`;
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

  /** Chatbot retrieval (FR-AI-001): announcements in the caller's D15 scope, best match first. */
  searchVisible(db: Db, scope: VisibleScope, tsquery: string, limit: number) {
    return db.$queryRaw<AnnouncementHit[]>`
      SELECT a.id, a.title, a.content, c.name AS club_name, d.name AS department_name,
        a.created_at, ts_rank(${ANNOUNCEMENT_FTS}, to_tsquery('simple', ${tsquery}))::float8 AS rank
      FROM announcements a
      LEFT JOIN clubs c ON c.id = a.club_id
      LEFT JOIN departments d ON d.id = a.department_id
      WHERE ${visibleSql(scope)} AND ${ANNOUNCEMENT_FTS} @@ to_tsquery('simple', ${tsquery})
      ORDER BY rank DESC, a.created_at DESC, a.id DESC
      LIMIT ${limit}`;
  },
};
