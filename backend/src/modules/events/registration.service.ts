import {
  AUDIT_ACTIONS,
  paginationMeta,
  type EventRegistration,
  type EventRegistrationsQuery,
  type MyRegistration,
  type MyRegistrationsQuery,
  type Paginated,
} from '@uniconnect/shared';
import { env } from '../../config/env.js';
import { AppError, conflict, forbidden } from '../../lib/http-error.js';
import type { EventRegistrationStatus } from '@uniconnect/shared';
import { logger } from '../../lib/logger.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { prisma } from '../../lib/prisma.js';
import { enqueueEmail } from '../../queues/email.queue.js';
import { auditService } from '../../services/audit.service.js';
import { isEligibleWith, type EventCaller } from './event.access.js';
import { registrationsCsv, toEventRegistration, toMyRegistration } from './event.mapper.js';
import { eventRepository } from './event.repository.js';
import {
  EVENT_NOT_FOUND,
  loadManaged,
  loadVisible,
  lockManaged,
  registerBlock,
  type RegisterBlock,
} from './event.service.js';
import { MY_REGISTRATION_SELECT, registrationRepository } from './registration.repository.js';

// Event registrations (PRD FR-EVENT-007–011; PRD #16 confirmed 2026-11-12; DECISIONS D36).
// Lock order: event row, then the registration row.

const REGISTRATION_NOT_FOUND = () =>
  new AppError(404, 'REGISTRATION_NOT_FOUND', 'Registration not found.');
const ALREADY_REGISTERED = () =>
  conflict('ALREADY_REGISTERED', 'You are already registered for this event.');
const EVENT_BUSY = () =>
  new AppError(
    503,
    'EVENT_BUSY',
    'Many people are registering for this event right now. Try again in a moment.',
  );

/**
 * How long one registration may wait in the event's queue. Past it Postgres cancels the wait
 * (lock_timeout) and the caller gets 503 EVENT_BUSY instead of a 500 from the transaction
 * timeout, which is longer.
 */
const LOCK_WAIT = '15s';
const REGISTER_TX = { maxWait: 15_000, timeout: 25_000 };

/** A lock_timeout cancel (55P03) or Prisma's transaction timeout (P2028). */
function isLockWait(err: unknown): boolean {
  const e = err as { code?: string; meta?: unknown; message?: string } | null;
  if (!e) return false;
  if (e.code === 'P2028') return true;
  const text = `${e.code ?? ''} ${JSON.stringify(e.meta ?? {})} ${e.message ?? ''}`;
  return text.includes('55P03') || /lock timeout/i.test(text);
}

/** The API error for each reason registration is refused. */
const BLOCK_ERRORS: Record<RegisterBlock, () => AppError> = {
  super_admin: () => forbidden(),
  already_registered: ALREADY_REGISTERED,
  no_show: () => conflict('REGISTRATION_NOT_ACTIVE', 'Your registration for this event is closed.'),
  not_open: () => conflict('EVENT_NOT_OPEN', 'This event is not open for registration.'),
  not_eligible: () =>
    new AppError(
      403,
      'NOT_ELIGIBLE',
      'This event is for members of the listed departments’ clubs only. You need an active membership, and your own department must be listed.',
    ),
  full: () => conflict('EVENT_FULL', 'This event is full.'),
};

export const registrationService = {
  /**
   * FR-EVENT-007. Visibility and eligibility are checked first, outside the lock: published
   * events never change visibility or departments (D36), and memberships aren't guarded by the
   * event lock anyway. Then the event row is locked, so for one event every registration (and
   * every cancellation and capacity change) runs one at a time: the seat count and the insert
   * can't interleave, and the hard cap can't be overbooked (PRD #16). Returns whether an old
   * cancelled row was reactivated.
   */
  async register(
    caller: EventCaller,
    eventId: number,
  ): Promise<{ data: MyRegistration; reactivated: boolean }> {
    // 404 for an event the caller can't see; nothing below reveals more.
    const loaded = await loadVisible(prisma, caller, eventId);
    const eligible = isEligibleWith(caller, loaded.facts, loaded.caller.memberOfListedClub);
    if (caller.role === 'super_admin') throw BLOCK_ERRORS.super_admin();

    let result: { id: number; reactivated: boolean };
    try {
      result = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_WAIT}'`);
        const state = await eventRepository.lockForRegistration(tx, eventId, new Date());
        if (!state) throw EVENT_NOT_FOUND();
        // A separate statement: its snapshot sees every registration committed before the lock.
        const seats = await eventRepository.seatsAndMine(tx, eventId, caller.id);
        const block = registerBlock({
          role: caller.role,
          status: state.status,
          ended: state.ended,
          visibility: state.visibility,
          eligible,
          myStatus: seats.my_status as EventRegistrationStatus | null,
          seated: seats.seated,
          maxAttendees: state.max_attendees,
        });
        if (block !== null) throw BLOCK_ERRORS[block]();

        if (seats.my_id !== null) {
          // Only a cancelled row is left here; registerBlock refused the others.
          await registrationRepository.reactivate(tx, seats.my_id);
          return { id: seats.my_id, reactivated: true };
        }
        const created = await registrationRepository.insert(tx, caller.id, eventId);
        return { id: created.id, reactivated: false };
      }, REGISTER_TX);
    } catch (err) {
      // The (user_id, event_id) unique index backs the row lock up for a double submit.
      if (isUniqueViolation(err)) throw ALREADY_REGISTERED();
      if (isLockWait(err)) throw EVENT_BUSY();
      throw err;
    }

    const reg = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id: result.id },
      select: { ...MY_REGISTRATION_SELECT, user: { select: { email: true, name: true } } },
    });
    try {
      await enqueueEmail({
        kind: 'event-registered',
        to: reg.user.email,
        name: reg.user.name,
        title: reg.event.title,
        clubName: reg.event.organizerClub.name,
        startDate: reg.event.startDate.toISOString(),
        venue: reg.event.venue,
        url: `${env.FRONTEND_ORIGIN}/dashboard/events/${eventId}`,
      });
    } catch (err) {
      // The registration is committed; a queue outage must not undo it.
      logger.error(`registration email not queued: ${(err as Error).message}`);
    }
    return { data: toMyRegistration(reg), reactivated: result.reactivated };
  },

  /** FR-EVENT-008. Own registration, before the event starts. */
  async cancel(caller: EventCaller, eventId: number): Promise<MyRegistration> {
    let id: number;
    try {
      id = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${LOCK_WAIT}'`);
        if (!(await eventRepository.lock(tx, eventId))) throw EVENT_NOT_FOUND();
        // No visibility check: someone whose membership lapsed can still drop their own seat.
        const row = await eventRepository.findById(tx, eventId);
        const mine = await registrationRepository.lockForUser(tx, caller.id, eventId);
        if (!row || !mine || mine.status === 'cancelled') throw REGISTRATION_NOT_FOUND();
        if (mine.status !== 'registered') {
          throw conflict(
            'REGISTRATION_NOT_ACTIVE',
            'This registration is closed and can no longer be cancelled.',
          );
        }
        if (row.startDate <= new Date()) {
          throw conflict(
            'EVENT_ALREADY_STARTED',
            'This event has started; registrations can no longer be cancelled.',
          );
        }
        await registrationRepository.cancel(tx, mine.id);
        return mine.id;
      }, REGISTER_TX);
    } catch (err) {
      if (isLockWait(err)) throw EVENT_BUSY();
      throw err;
    }
    const reg = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id },
      select: MY_REGISTRATION_SELECT,
    });
    return toMyRegistration(reg);
  },

  /** FR-EVENT-009. Every registration the caller holds, any status. */
  async listMine(caller: EventCaller, q: MyRegistrationsQuery): Promise<Paginated<MyRegistration>> {
    const { rows, total } = await registrationRepository.listMine(
      prisma,
      caller.id,
      q.when,
      new Date(),
      q.page,
      q.limit,
    );
    return { data: rows.map(toMyRegistration), meta: paginationMeta(q.page, q.limit, total) };
  },

  /** FR-EVENT-011. Organizers only; never email or phone. */
  async listForEvent(
    caller: EventCaller,
    eventId: number,
    q: EventRegistrationsQuery,
  ): Promise<Paginated<EventRegistration>> {
    await loadManaged(prisma, caller, eventId);
    const { rows, total } = await registrationRepository.listForEvent(
      prisma,
      eventId,
      q.status,
      q.page,
      q.limit,
    );
    return { data: rows.map(toEventRegistration), meta: paginationMeta(q.page, q.limit, total) };
  },

  /** FR-EVENT-011 `?format=csv`: every row matching the filter, in one file. */
  async csvForEvent(
    caller: EventCaller,
    eventId: number,
    q: EventRegistrationsQuery,
  ): Promise<string> {
    await loadManaged(prisma, caller, eventId);
    const { rows } = await registrationRepository.listForEvent(
      prisma,
      eventId,
      q.status,
      1,
      undefined,
    );
    return registrationsCsv(rows.map(toEventRegistration));
  },

  /** FR-EVENT-010. registered → attended, on a published event. */
  async checkIn(caller: EventCaller, eventId: number, regId: number): Promise<EventRegistration> {
    await prisma.$transaction(async (tx) => {
      const { row } = await lockManaged(tx, caller, eventId);
      const reg = await registrationRepository.lockById(tx, regId);
      if (!reg || reg.event_id !== eventId) throw REGISTRATION_NOT_FOUND();
      if (row.status !== 'published') {
        throw conflict('EVENT_NOT_PUBLISHED', 'Check-in is open on published events only.');
      }
      if (reg.status === 'attended') {
        throw conflict('ALREADY_CHECKED_IN', 'This person is already checked in.');
      }
      if (reg.status !== 'registered') {
        throw conflict(
          'REGISTRATION_NOT_ACTIVE',
          `A ${reg.status} registration can't be checked in.`,
        );
      }
      await registrationRepository.checkIn(tx, regId);
      await auditService.record(tx, {
        userId: caller.id,
        action: AUDIT_ACTIONS.EVENT_CHECK_IN,
        entityType: 'event_registration',
        entityId: regId,
        oldValue: { status: 'registered' },
        newValue: { status: 'attended', event_id: eventId },
        ipAddress: caller.ip,
      });
    });
    const reg = await registrationRepository.findById(prisma, regId);
    if (!reg) throw REGISTRATION_NOT_FOUND();
    return toEventRegistration(reg);
  },
};
