import type { EventRegistrationStatus } from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';
import { EVENT_SELECT } from './event.repository.js';

/** A registrant, for organizers: never email or phone (DECISIONS D36). */
export const REGISTRATION_SELECT = {
  id: true,
  eventId: true,
  userId: true,
  status: true,
  registeredAt: true,
  checkedInAt: true,
  cancelledAt: true,
  user: {
    select: {
      id: true,
      name: true,
      image: true,
      studentId: true,
      department: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.EventRegistrationSelect;

export type RegistrationRow = Prisma.EventRegistrationGetPayload<{
  select: typeof REGISTRATION_SELECT;
}>;

export const MY_REGISTRATION_SELECT = {
  id: true,
  status: true,
  registeredAt: true,
  checkedInAt: true,
  cancelledAt: true,
  event: { select: EVENT_SELECT },
} satisfies Prisma.EventRegistrationSelect;

export type MyRegistrationRow = Prisma.EventRegistrationGetPayload<{
  select: typeof MY_REGISTRATION_SELECT;
}>;

export const registrationRepository = {
  /** The caller's row for an event, locked until the transaction ends. */
  async lockForUser(db: Db, userId: string, eventId: number) {
    const rows = await db.$queryRaw<{ id: number; status: EventRegistrationStatus }[]>`
      SELECT id, status FROM event_registrations
      WHERE user_id = ${userId}::uuid AND event_id = ${eventId} FOR UPDATE`;
    return rows[0] ?? null;
  },

  /** A registration row, locked. Null when it doesn't exist. */
  async lockById(db: Db, id: number) {
    const rows = await db.$queryRaw<
      { id: number; event_id: number; status: EventRegistrationStatus }[]
    >`
      SELECT id, event_id, status FROM event_registrations WHERE id = ${id} FOR UPDATE`;
    return rows[0] ?? null;
  },

  findForUser(db: Db, userId: string, eventId: number) {
    return db.eventRegistration.findUnique({
      where: { userId_eventId: { userId, eventId } },
      select: { id: true, status: true },
    });
  },

  findById(db: Db, id: number) {
    return db.eventRegistration.findUnique({ where: { id }, select: REGISTRATION_SELECT });
  },

  insert(db: Db, userId: string, eventId: number) {
    return db.eventRegistration.create({
      data: { userId, eventId, status: 'registered' },
      select: { id: true },
    });
  },

  /** A cancelled row comes back instead of a second insert (FR-EVENT-007 check 4). */
  reactivate(db: Db, id: number) {
    return db.eventRegistration.update({
      where: { id },
      data: { status: 'registered', cancelledAt: null, registeredAt: new Date() },
      select: { id: true },
    });
  },

  cancel(db: Db, id: number) {
    return db.eventRegistration.update({
      where: { id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
  },

  checkIn(db: Db, id: number) {
    return db.eventRegistration.update({
      where: { id },
      data: { status: 'attended', checkedInAt: new Date() },
    });
  },

  /** On completion, whoever is still `registered` didn't come (DECISIONS D36). */
  async markNoShows(db: Db, eventId: number): Promise<number> {
    const { count } = await db.eventRegistration.updateMany({
      where: { eventId, status: 'registered' },
      data: { status: 'no_show' },
    });
    return count;
  },

  /** FR-EVENT-011. `take` undefined = every row (CSV). */
  async listForEvent(
    db: Db,
    eventId: number,
    status: EventRegistrationStatus | undefined,
    page: number,
    take: number | undefined,
  ) {
    const where: Prisma.EventRegistrationWhereInput = {
      eventId,
      ...(status === undefined ? {} : { status }),
    };
    const [rows, total] = await Promise.all([
      db.eventRegistration.findMany({
        where,
        select: REGISTRATION_SELECT,
        orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
        ...(take === undefined ? {} : { skip: (page - 1) * take, take }),
      }),
      db.eventRegistration.count({ where }),
    ]);
    return { rows, total };
  },

  /** FR-EVENT-009. `when` splits on the event's end: still running counts as upcoming. */
  async listMine(
    db: Db,
    userId: string,
    when: 'upcoming' | 'past' | undefined,
    now: Date,
    page: number,
    limit: number,
  ) {
    const where: Prisma.EventRegistrationWhereInput = {
      userId,
      ...(when === 'upcoming' ? { event: { endDate: { gte: now } } } : {}),
      ...(when === 'past' ? { event: { endDate: { lt: now } } } : {}),
    };
    const [rows, total] = await Promise.all([
      db.eventRegistration.findMany({
        where,
        select: MY_REGISTRATION_SELECT,
        orderBy: [{ event: { startDate: when === 'past' ? 'desc' : 'asc' } }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.eventRegistration.count({ where }),
    ]);
    return { rows, total };
  },
};
