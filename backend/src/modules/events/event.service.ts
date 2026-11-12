import {
  AUDIT_ACTIONS,
  paginationMeta,
  type AuditAction,
  type CreateEventInput,
  type EventDetail,
  type EventListQuery,
  type EventRegistrationStatus,
  type EventSummary,
  type Paginated,
  type UpdateEventInput,
} from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { uploadEventPoster } from '../../lib/cloudinary.js';
import { todayInDhaka } from '../../lib/dates.js';
import { AppError, badRequest, conflict, forbidden } from '../../lib/http-error.js';
import { isAllowedImage } from '../../lib/image.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { INVALID_TYPE_MESSAGE } from '../../middleware/upload.js';
import { queueEventNotification } from '../../queues/event.queue.js';
import type { Db } from '../../repositories/audit.repository.js';
import { auditService } from '../../services/audit.service.js';
import { clubRepository } from '../clubs/club.repository.js';
import {
  canManageWith,
  canSeeWith,
  eventAccess,
  isEligibleWith,
  type CallerFacts,
  type EventCaller,
  type EventFacts,
} from './event.access.js';
import { toEventSummary } from './event.mapper.js';
import { eventRepository, type EventRow, type EventUpdateData } from './event.repository.js';
import { registrationRepository } from './registration.repository.js';

// Events (PRD FR-EVENT-001–006, -012; DECISIONS D36). Lock order in this module: event row,
// then a registration row. Nothing here locks a user or club row while holding an event lock.

export const EVENT_NOT_FOUND = () => new AppError(404, 'EVENT_NOT_FOUND', 'Event not found.');
const CLUB_NOT_FOUND = () => new AppError(404, 'CLUB_NOT_FOUND', 'Club not found.');

const validation = (path: string, message: string) =>
  badRequest('VALIDATION_ERROR', 'Request validation failed.', [{ path, message }]);

/** Fields that can't change once an event is published (FR-EVENT-004, DECISIONS D36). */
const LOCKED_AFTER_PUBLISH = ['start_date', 'end_date', 'visibility', 'department_ids'] as const;

/** A loaded event and what the caller may do with it. */
export interface LoadedEvent {
  row: EventRow;
  facts: EventFacts;
  caller: CallerFacts;
  manages: boolean;
}

export const toFacts = (row: EventRow): EventFacts => ({
  status: row.status,
  visibility: row.visibility,
  organizerClubId: row.organizerClubId,
  clubDepartmentId: row.organizerClub.departmentId,
  departmentIds: row.departments.map((d) => d.department.id),
});

/**
 * Loads an event the caller can see, or throws 404: an event they can't see doesn't exist
 * for them (FR-EVENT-006). Inside a transaction, call it after locking the row.
 */
export async function loadVisible(db: Db, caller: EventCaller, id: number): Promise<LoadedEvent> {
  const row = await eventRepository.findById(db, id);
  if (!row) throw EVENT_NOT_FOUND();
  const facts = toFacts(row);
  const callerFacts = await eventAccess.callerFacts(db, caller, facts);
  if (!canSeeWith(caller, facts, callerFacts)) throw EVENT_NOT_FOUND();
  const manages = canManageWith(caller, facts.clubDepartmentId, callerFacts.seatInOrganizerClub);
  return { row, facts, caller: callerFacts, manages };
}

/** As loadVisible, then 403 unless the caller manages the event (PRD #3). */
export async function loadManaged(db: Db, caller: EventCaller, id: number): Promise<LoadedEvent> {
  const loaded = await loadVisible(db, caller, id);
  if (!loaded.manages) throw forbidden();
  return loaded;
}

/** Locks the event row (404 if missing), then loads it for an organizer. */
export async function lockManaged(tx: Db, caller: EventCaller, id: number) {
  if (!(await eventRepository.lock(tx, id))) throw EVENT_NOT_FOUND();
  return loadManaged(tx, caller, id);
}

export type RegisterBlock =
  'super_admin' | 'already_registered' | 'no_show' | 'not_open' | 'not_eligible' | 'full';

/**
 * Why the caller can't register (FR-EVENT-007), or null. The same order as the checks in
 * registrationService.register, so the detail page and the endpoint agree.
 */
export function registerBlock(input: {
  role: string;
  status: string;
  /** `end_date` has passed. */
  ended: boolean;
  visibility: string;
  eligible: boolean;
  myStatus: EventRegistrationStatus | null;
  seated: number;
  maxAttendees: number | null;
}): RegisterBlock | null {
  if (input.role === 'super_admin') return 'super_admin';
  if (input.myStatus === 'registered' || input.myStatus === 'attended') {
    return 'already_registered';
  }
  if (input.myStatus === 'no_show') return 'no_show';
  if (input.status !== 'published' || input.ended) return 'not_open';
  if (input.visibility === 'members_only' && !input.eligible) return 'not_eligible';
  if (input.maxAttendees !== null && input.seated >= input.maxAttendees) return 'full';
  return null;
}

/** The changed fields of `row` vs `next`, as audit values with API names. */
function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const oldValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const a = before[key];
    const b = after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      oldValue[key] = a;
      newValue[key] = b;
    }
  }
  return { oldValue, newValue, changed: Object.keys(newValue) };
}

/** The editable fields of a row, with API names, for diffing. */
function editable(row: EventRow) {
  return {
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    is_paid: row.isPaid,
    fee_amount: row.feeAmount === null ? null : row.feeAmount.toFixed(2),
    start_date: row.startDate.toISOString(),
    end_date: row.endDate.toISOString(),
    venue: row.venue,
    max_attendees: row.maxAttendees,
    department_ids: row.departments.map((d) => d.department.id).sort((a, b) => a - b),
  };
}

/** Every listed department exists; the organizer's is added (FR-EVENT-001 step 3). */
async function resolveDepartments(db: Db, ids: number[], organizerDept: number) {
  const wanted = [...new Set([...ids, organizerDept])].sort((a, b) => a - b);
  const found = new Set(await eventRepository.existingDepartmentIds(db, wanted));
  const missing = wanted.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw badRequest('UNKNOWN_DEPARTMENT', 'One or more departments do not exist.', {
      department_ids: missing,
    });
  }
  return wanted;
}

async function audit(
  tx: Db,
  caller: EventCaller,
  action: AuditAction,
  eventId: number,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown>,
) {
  await auditService.record(tx, {
    userId: caller.id,
    action,
    entityType: 'event',
    entityId: eventId,
    ...(oldValue === null ? {} : { oldValue: oldValue as Prisma.InputJsonValue }),
    newValue: newValue as Prisma.InputJsonValue,
    ipAddress: caller.ip,
  });
}

/** Queues the publish or cancel fan-out after commit; a queue outage doesn't undo the change. */
async function notify(eventId: number, kind: 'published' | 'cancelled') {
  try {
    await queueEventNotification(eventId, kind);
  } catch (err) {
    logger.error(`event ${eventId} ${kind} emails not queued: ${(err as Error).message}`);
  }
}

export const eventService = {
  /** FR-EVENT-001. Inserts a draft with its departments. */
  async create(caller: EventCaller, input: CreateEventInput): Promise<EventDetail> {
    const start = new Date(input.start_date);
    if (start <= new Date()) throw validation('start_date', 'The event must start in the future.');

    const clubDept = await clubRepository.findDepartmentId(prisma, input.organizer_club_id);
    if (clubDept === null) throw CLUB_NOT_FOUND();
    if (!(await eventAccess.canManageClub(prisma, caller, input.organizer_club_id, clubDept))) {
      throw forbidden();
    }
    const departmentIds = await resolveDepartments(prisma, input.department_ids, clubDept);

    const id = await prisma.$transaction(async (tx) => {
      const eventId = await eventRepository.create(tx, {
        title: input.title,
        description: input.description ?? null,
        organizerClubId: input.organizer_club_id,
        visibility: input.visibility,
        isPaid: input.is_paid,
        feeAmount: input.is_paid ? (input.fee_amount ?? null) : null,
        startDate: start,
        endDate: new Date(input.end_date),
        venue: input.venue ?? null,
        maxAttendees: input.max_attendees ?? null,
        createdById: caller.id,
        departmentIds,
      });
      await audit(tx, caller, AUDIT_ACTIONS.EVENT_CREATED, eventId, null, {
        title: input.title,
        organizer_club_id: input.organizer_club_id,
        visibility: input.visibility,
        start_date: start.toISOString(),
        end_date: new Date(input.end_date).toISOString(),
        department_ids: departmentIds,
      });
      return eventId;
    });
    return eventService.detail(caller, id);
  },

  /** FR-EVENT-006. Visibility, filters and search run in one SQL query. */
  async list(caller: EventCaller, q: EventListQuery): Promise<Paginated<EventSummary>> {
    const { ids, total } = await eventRepository.browse(
      prisma,
      caller,
      q,
      new Date(),
      todayInDhaka(),
    );
    const rows = await eventRepository.findManyOrdered(prisma, ids);
    return { data: rows.map(toEventSummary), meta: paginationMeta(q.page, q.limit, total) };
  },

  /** GET /events/:id: 404 unless visible; adds counts and what the caller may do. */
  async detail(caller: EventCaller, id: number): Promise<EventDetail> {
    const loaded = await loadVisible(prisma, caller, id);
    const { row } = loaded;
    const [seated, mine] = await Promise.all([
      eventRepository.countSeated(prisma, id),
      caller.role === 'super_admin'
        ? Promise.resolve(null)
        : registrationRepository.findForUser(prisma, caller.id, id),
    ]);
    const block = registerBlock({
      role: caller.role,
      status: row.status,
      ended: row.endDate <= new Date(),
      visibility: row.visibility,
      eligible: isEligibleWith(caller, loaded.facts, loaded.caller.memberOfListedClub),
      myStatus: (mine?.status as EventRegistrationStatus | undefined) ?? null,
      seated,
      maxAttendees: row.maxAttendees,
    });
    return {
      ...toEventSummary(row),
      registered_count: seated,
      my_registration: mine
        ? { id: mine.id, status: mine.status as EventRegistrationStatus }
        : null,
      can_manage: loaded.manages,
      can_register: block === null,
      register_blocked_reason: block,
    };
  },

  /**
   * FR-EVENT-004. Cancelled and completed events are frozen; after publish the dates,
   * visibility and departments are too. Writes and audits changed fields only.
   */
  async update(caller: EventCaller, id: number, input: UpdateEventInput): Promise<EventDetail> {
    await prisma.$transaction(async (tx) => {
      const { row } = await lockManaged(tx, caller, id);
      if (row.status === 'cancelled' || row.status === 'completed') {
        throw conflict('EVENT_NOT_EDITABLE', `A ${row.status} event can't be edited.`);
      }
      if (row.status === 'published') {
        const locked = LOCKED_AFTER_PUBLISH.filter((f) => input[f] !== undefined);
        if (locked.length > 0) {
          throw new AppError(
            409,
            'EVENT_FIELD_LOCKED',
            "A published event's dates, visibility and departments can't change.",
            { fields: locked },
          );
        }
      }

      const before = editable(row);
      const start = input.start_date ? new Date(input.start_date) : row.startDate;
      const end = input.end_date ? new Date(input.end_date) : row.endDate;
      if (input.start_date && start <= new Date()) {
        throw validation('start_date', 'The event must start in the future.');
      }
      if (end <= start) throw validation('end_date', 'The event must end after it starts.');

      const isPaid = input.is_paid ?? row.isPaid;
      // Turning a paid event free clears its fee unless a fee is sent too (then it's a 400).
      const fee =
        input.fee_amount !== undefined ? input.fee_amount : isPaid ? before.fee_amount : null;
      if (isPaid && fee === null) throw validation('fee_amount', 'A paid event needs a fee.');
      if (!isPaid && fee !== null) {
        throw validation('fee_amount', 'Only a paid event can have a fee.');
      }

      if (input.max_attendees !== undefined && input.max_attendees !== null) {
        const seated = await eventRepository.countSeated(tx, id);
        if (input.max_attendees < seated) {
          throw conflict(
            'CAPACITY_BELOW_REGISTRATIONS',
            `${seated} people are already registered; capacity can't go below that.`,
          );
        }
      }

      const departmentIds =
        input.department_ids === undefined
          ? before.department_ids
          : await resolveDepartments(tx, input.department_ids, row.organizerClub.departmentId);

      const after = {
        title: input.title ?? before.title,
        description: input.description !== undefined ? input.description : before.description,
        visibility: input.visibility ?? before.visibility,
        is_paid: isPaid,
        fee_amount: fee,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        venue: input.venue !== undefined ? input.venue : before.venue,
        max_attendees:
          input.max_attendees !== undefined ? input.max_attendees : before.max_attendees,
        department_ids: departmentIds,
      };
      const { oldValue, newValue, changed } = diff(before, after);
      if (changed.length === 0) return;

      const data: EventUpdateData = {};
      if ('title' in newValue) data.title = after.title;
      if ('description' in newValue) data.description = after.description;
      if ('visibility' in newValue) data.visibility = after.visibility;
      if ('is_paid' in newValue) data.isPaid = after.is_paid;
      if ('fee_amount' in newValue) data.feeAmount = after.fee_amount;
      if ('start_date' in newValue) data.startDate = start;
      if ('end_date' in newValue) data.endDate = end;
      if ('venue' in newValue) data.venue = after.venue;
      if ('max_attendees' in newValue) data.maxAttendees = after.max_attendees;
      if (Object.keys(data).length > 0) await eventRepository.update(tx, id, data);
      if ('department_ids' in newValue) {
        await eventRepository.replaceDepartments(tx, id, departmentIds);
      }
      await audit(tx, caller, AUDIT_ACTIONS.EVENT_UPDATED, id, oldValue, newValue);
    });
    return eventService.detail(caller, id);
  },

  /** FR-EVENT-002. Only Cloudinary URLs are stored; the body can't set the poster. */
  async updatePoster(caller: EventCaller, id: number, file: Buffer): Promise<EventDetail> {
    if (!isAllowedImage(file)) throw badRequest('INVALID_FILE_TYPE', INVALID_TYPE_MESSAGE);

    // Check before uploading; the transaction checks again under the lock.
    const assertPosterable = (status: string) => {
      if (status !== 'draft' && status !== 'published') {
        throw conflict('EVENT_NOT_EDITABLE', `A ${status} event can't be edited.`);
      }
    };
    assertPosterable((await loadManaged(prisma, caller, id)).row.status);

    // The upload can't join a transaction; public_id is fixed per event, so a failed save
    // leaves no extra file behind.
    const url = await uploadEventPoster(id, file);

    await prisma.$transaction(async (tx) => {
      const { row } = await lockManaged(tx, caller, id);
      assertPosterable(row.status);
      await eventRepository.update(tx, id, { posterImageUrl: url });
      await audit(
        tx,
        caller,
        AUDIT_ACTIONS.EVENT_UPDATED,
        id,
        { poster_image_url: row.posterImageUrl },
        { poster_image_url: url },
      );
    });
    return eventService.detail(caller, id);
  },

  /** FR-EVENT-003. draft → published, then the "new event" emails (DECISIONS D36). */
  async publish(caller: EventCaller, id: number): Promise<EventDetail> {
    await prisma.$transaction(async (tx) => {
      const { row } = await lockManaged(tx, caller, id);
      if (row.status !== 'draft') {
        throw conflict('EVENT_NOT_DRAFT', 'Only a draft event can be published.');
      }
      if (row.startDate <= new Date()) {
        throw conflict(
          'EVENT_ALREADY_STARTED',
          'This event has already started. Change its dates before publishing.',
        );
      }
      await eventRepository.update(tx, id, { status: 'published' });
      await audit(
        tx,
        caller,
        AUDIT_ACTIONS.EVENT_PUBLISHED,
        id,
        { status: 'draft' },
        { status: 'published' },
      );
    });
    await notify(id, 'published');
    return eventService.detail(caller, id);
  },

  /** FR-EVENT-005. Registrations keep their rows; registrants of a published event get an email. */
  async cancel(caller: EventCaller, id: number): Promise<EventDetail> {
    const wasPublished = await prisma.$transaction(async (tx) => {
      const { row } = await lockManaged(tx, caller, id);
      if (row.status !== 'draft' && row.status !== 'published') {
        throw conflict('EVENT_NOT_CANCELLABLE', `A ${row.status} event can't be cancelled.`);
      }
      await eventRepository.update(tx, id, { status: 'cancelled' });
      await audit(
        tx,
        caller,
        AUDIT_ACTIONS.EVENT_CANCELLED,
        id,
        { status: row.status },
        { status: 'cancelled' },
      );
      return row.status === 'published';
    });
    if (wasPublished) await notify(id, 'cancelled');
    return eventService.detail(caller, id);
  },

  /** FR-EVENT-012. After the end only; whoever is still `registered` becomes `no_show`. */
  async complete(caller: EventCaller, id: number): Promise<EventDetail> {
    await prisma.$transaction(async (tx) => {
      const { row } = await lockManaged(tx, caller, id);
      if (row.status !== 'published') {
        throw conflict('EVENT_NOT_PUBLISHED', 'Only a published event can be completed.');
      }
      if (row.endDate > new Date()) {
        throw conflict('EVENT_NOT_ENDED', "This event hasn't ended yet.");
      }
      await eventRepository.update(tx, id, { status: 'completed' });
      const noShows = await registrationRepository.markNoShows(tx, id);
      await audit(
        tx,
        caller,
        AUDIT_ACTIONS.EVENT_COMPLETED,
        id,
        { status: 'published' },
        { status: 'completed', no_show_count: noShows },
      );
    });
    return eventService.detail(caller, id);
  },
};
