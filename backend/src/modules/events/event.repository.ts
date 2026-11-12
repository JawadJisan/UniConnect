import type { EventListQuery } from '@uniconnect/shared';
import { Prisma } from '../../generated/prisma/client.js';
import type { IsoDate } from '../../lib/dates.js';
import type { Db } from '../../repositories/audit.repository.js';
import type { EventCaller } from './event.access.js';

/** The columns of an event in a response. */
export const EVENT_SELECT = {
  id: true,
  title: true,
  description: true,
  organizerClubId: true,
  visibility: true,
  isPaid: true,
  feeAmount: true,
  startDate: true,
  endDate: true,
  venue: true,
  maxAttendees: true,
  posterImageUrl: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  organizerClub: { select: { id: true, name: true, departmentId: true } },
  departments: {
    select: { department: { select: { id: true, name: true } } },
    orderBy: { department: { name: 'asc' } },
  },
  // Seats taken: `registered` and `attended` (the same statuses as countSeated).
  _count: {
    select: { registrations: { where: { status: { in: ['registered', 'attended'] } } } },
  },
} satisfies Prisma.EventSelect;

export type EventRow = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;

/** Fields PATCH /events/:id may write, in Prisma names. */
export interface EventUpdateData {
  title?: string;
  description?: string | null;
  visibility?: string;
  isPaid?: boolean;
  feeAmount?: string | null;
  startDate?: Date;
  endDate?: Date;
  venue?: string | null;
  maxAttendees?: number | null;
  posterImageUrl?: string;
  status?: string;
}

export interface EventInsert {
  title: string;
  description: string | null;
  organizerClubId: number;
  visibility: string;
  isPaid: boolean;
  feeAmount: string | null;
  startDate: Date;
  endDate: Date;
  venue: string | null;
  maxAttendees: number | null;
  createdById: string;
  departmentIds: number[];
}

/**
 * A Date as a `timestamp` literal. Event times are `TIMESTAMP(3)` holding UTC wall time
 * (Prisma's convention); casting the ISO string to `timestamp` drops the `Z`, so comparisons
 * never depend on the session time zone.
 */
const ts = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;

/**
 * The browse visibility rule (FR-EVENT-006, PRD #7) as SQL over `e`. Must match
 * event.access.ts `canSeeWith`; events.test.ts and the integration tests check both.
 */
function visibleTo(caller: EventCaller, today: IsoDate): Prisma.Sql {
  if (caller.role === 'super_admin') return Prisma.sql`TRUE`;

  const dept = caller.departmentId;
  const manages =
    caller.role === 'dept_admin' && dept !== null
      ? Prisma.sql`EXISTS (SELECT 1 FROM clubs c WHERE c.id = e.organizer_club_id AND c.department_id = ${dept})`
      : caller.role === 'moderator'
        ? Prisma.sql`EXISTS (SELECT 1 FROM club_committee_members m
            WHERE m.club_id = e.organizer_club_id AND m.user_id = ${caller.id}::uuid AND m.is_current)`
        : Prisma.sql`FALSE`;
  const deptListed =
    dept === null
      ? Prisma.sql`FALSE`
      : Prisma.sql`EXISTS (SELECT 1 FROM event_departments d WHERE d.event_id = e.id AND d.department_id = ${dept})`;
  const adminOfListed = caller.role === 'dept_admin' ? deptListed : Prisma.sql`FALSE`;
  const eligible = Prisma.sql`(${deptListed} AND EXISTS (
      SELECT 1 FROM club_memberships cm
      JOIN clubs mc ON mc.id = cm.club_id
      JOIN event_departments md ON md.department_id = mc.department_id AND md.event_id = e.id
      WHERE cm.user_id = ${caller.id}::uuid AND cm.status = 'active' AND cm.end_date >= ${today}::date))`;

  return Prisma.sql`(
    (e.status = 'draft' AND ${manages})
    OR (e.status <> 'draft' AND (e.visibility = 'public' OR ${manages} OR ${adminOfListed} OR ${eligible}))
  )`;
}

function filters(q: EventListQuery, now: Date): Prisma.Sql[] {
  const where: Prisma.Sql[] = [];
  if (q.department_id !== undefined) {
    where.push(
      Prisma.sql`EXISTS (SELECT 1 FROM event_departments f WHERE f.event_id = e.id AND f.department_id = ${q.department_id})`,
    );
  }
  if (q.club_id !== undefined) where.push(Prisma.sql`e.organizer_club_id = ${q.club_id}`);
  if (q.visibility !== undefined) where.push(Prisma.sql`e.visibility = ${q.visibility}`);
  if (q.is_paid !== undefined) where.push(Prisma.sql`e.is_paid = ${q.is_paid}`);
  switch (q.status) {
    case 'upcoming':
      where.push(Prisma.sql`e.status = 'published' AND e.start_date > ${ts(now)}`);
      break;
    case 'past':
      where.push(Prisma.sql`e.status IN ('published', 'completed') AND e.end_date < ${ts(now)}`);
      break;
    case 'published':
    case 'draft':
    case 'cancelled':
      where.push(Prisma.sql`e.status = ${q.status}`);
      break;
  }
  if (q.search !== undefined) {
    // The exact events_fts expression, or the GIN index is skipped (.claude/rules/database.md).
    where.push(
      Prisma.sql`to_tsvector('simple', e.title || ' ' || coalesce(e.description, '')) @@ plainto_tsquery('simple', ${q.search})`,
    );
  }
  return where;
}

export const eventRepository = {
  findById(db: Db, id: number) {
    return db.event.findUnique({ where: { id }, select: EVENT_SELECT });
  },

  /** Locks the event row until the transaction ends. False when it doesn't exist. */
  async lock(db: Db, id: number): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM events WHERE id = ${id} FOR UPDATE`;
    return rows.length > 0;
  },

  async create(db: Db, data: EventInsert) {
    const { departmentIds, ...event } = data;
    const row = await db.event.create({ data: event, select: { id: true } });
    await db.eventDepartment.createMany({
      data: departmentIds.map((departmentId) => ({ eventId: row.id, departmentId })),
    });
    return row.id;
  },

  update(db: Db, id: number, data: EventUpdateData) {
    return db.event.update({ where: { id }, data, select: { id: true } });
  },

  async replaceDepartments(db: Db, id: number, departmentIds: number[]) {
    await db.eventDepartment.deleteMany({ where: { eventId: id } });
    await db.eventDepartment.createMany({
      data: departmentIds.map((departmentId) => ({ eventId: id, departmentId })),
    });
  },

  /** The ids among `ids` that are real departments. */
  async existingDepartmentIds(db: Db, ids: number[]): Promise<number[]> {
    const rows = await db.department.findMany({ where: { id: { in: ids } }, select: { id: true } });
    return rows.map((r) => r.id);
  },

  /**
   * FR-EVENT-007, step 1 of the capacity lock: locks the event row and reads its state.
   *
   * The seat count must NOT be read in this statement. At Read Committed, a SELECT … FOR UPDATE
   * that waited for the lock re-checks only the locked row; subqueries and joins keep the
   * snapshot from before the wait, so they would miss the registrations committed by whoever
   * held the lock (the parallel test overbooked 10 into 3 that way). seatsAndMine runs as the
   * next statement, which takes a fresh snapshot after the lock is held.
   */
  async lockForRegistration(db: Db, eventId: number, now: Date) {
    const rows = await db.$queryRaw<
      { status: string; visibility: string; ended: boolean; max_attendees: number | null }[]
    >`
      SELECT status, visibility, end_date <= ${ts(now)} AS ended, max_attendees
      FROM events WHERE id = ${eventId} FOR UPDATE`;
    return rows[0] ?? null;
  },

  /**
   * FR-EVENT-007, step 2, after lockForRegistration in the same transaction: seats taken and
   * the caller's own row, in one round trip with a snapshot taken after the lock.
   */
  async seatsAndMine(db: Db, eventId: number, userId: string) {
    const rows = await db.$queryRaw<
      { seated: number; my_id: number | null; my_status: string | null }[]
    >`
      SELECT
        (SELECT count(*)::int FROM event_registrations
          WHERE event_id = ${eventId} AND status IN ('registered', 'attended')) AS seated,
        (SELECT id FROM event_registrations
          WHERE event_id = ${eventId} AND user_id = ${userId}::uuid) AS my_id,
        (SELECT status FROM event_registrations
          WHERE event_id = ${eventId} AND user_id = ${userId}::uuid) AS my_status`;
    return rows[0]!;
  },

  /** Registrations that hold a seat: `registered` and `attended`. */
  countSeated(db: Db, eventId: number) {
    return db.eventRegistration.count({
      where: { eventId, status: { in: ['registered', 'attended'] } },
    });
  },

  /** FR-EVENT-006: one page of ids the caller may see, plus the total. */
  async browse(db: Db, caller: EventCaller, q: EventListQuery, now: Date, today: IsoDate) {
    const where = Prisma.join([visibleTo(caller, today), ...filters(q, now)], ' AND ');
    // Past events newest first; everything else soonest first. id breaks ties.
    const order =
      q.status === 'past' || q.status === 'cancelled'
        ? Prisma.sql`e.start_date DESC, e.id DESC`
        : Prisma.sql`e.start_date ASC, e.id ASC`;
    const [ids, count] = await Promise.all([
      db.$queryRaw<{ id: number }[]>`
        SELECT e.id FROM events e WHERE ${where}
        ORDER BY ${order} LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
      db.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM events e WHERE ${where}`,
    ]);
    return { ids: ids.map((r) => r.id), total: Number(count[0]?.total ?? 0) };
  },

  /** Rows for `ids`, in the order given. */
  async findManyOrdered(db: Db, ids: number[]): Promise<EventRow[]> {
    if (ids.length === 0) return [];
    const rows = await db.event.findMany({ where: { id: { in: ids } }, select: EVENT_SELECT });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  },

  /**
   * Who gets the "new event" email (DECISIONS D36): active, verified students and faculty of a
   * listed department, minus the creator; for members-only events, only eligible members
   * (PRD #7). An id cursor pages through them.
   */
  publishRecipients(
    db: Db,
    eventId: number,
    membersOnly: boolean,
    today: IsoDate,
    afterId: string | null,
    take: number,
  ) {
    const cursor = afterId === null ? Prisma.sql`TRUE` : Prisma.sql`u.id > ${afterId}::uuid`;
    const eligible = membersOnly
      ? Prisma.sql`EXISTS (
          SELECT 1 FROM club_memberships cm
          JOIN clubs mc ON mc.id = cm.club_id
          JOIN event_departments md ON md.department_id = mc.department_id AND md.event_id = e.id
          WHERE cm.user_id = u.id AND cm.status = 'active' AND cm.end_date >= ${today}::date)`
      : Prisma.sql`TRUE`;
    return db.$queryRaw<{ id: string; email: string; name: string }[]>`
      SELECT u.id, u.email, u.name
      FROM users u
      JOIN events e ON e.id = ${eventId}
      WHERE u.is_active AND u.email_verified
        AND u.user_type IN ('student', 'faculty')
        AND u.id <> e.created_by
        AND EXISTS (SELECT 1 FROM event_departments d WHERE d.event_id = e.id AND d.department_id = u.department_id)
        AND ${eligible} AND ${cursor}
      ORDER BY u.id LIMIT ${take}`;
  },

  /** Who gets the cancellation email: everyone still `registered`. */
  cancelRecipients(db: Db, eventId: number, afterId: string | null, take: number) {
    return db.user.findMany({
      where: {
        isActive: true,
        eventRegistrations: { some: { eventId, status: 'registered' } },
        ...(afterId === null ? {} : { id: { gt: afterId } }),
      },
      select: { id: true, email: true, name: true },
      orderBy: { id: 'asc' },
      take,
    });
  },
};
