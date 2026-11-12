import { toDbDate, todayInDhaka } from '../../lib/dates.js';
import type { Db } from '../../repositories/audit.repository.js';
import { committeeRepository } from '../committee/committee.repository.js';

// Who may see and who may manage an event (PRD FR-EVENT-001, -006, -007; PRD #3 and #7
// confirmed 2026-11-12; DECISIONS D36). The rules themselves are pure functions over facts
// loaded once per request, so they can be unit-tested; event.repository.ts repeats the same
// rules in SQL for the browse list.

export interface EventCaller {
  id: string;
  role: string;
  departmentId: number | null;
  ip: string | null;
}

/** The parts of an event the rules read. */
export interface EventFacts {
  status: string;
  visibility: string;
  organizerClubId: number;
  /** The organizer club's department. */
  clubDepartmentId: number;
  /** EventDepartment rows, organizer's department included. */
  departmentIds: readonly number[];
}

/** Facts about the caller that need a query, loaded only when a rule needs them. */
export interface CallerFacts {
  /** Holds a current committee seat in the organizer club. */
  seatInOrganizerClub: boolean;
  /** Has an active, unexpired membership in a club of a listed department. */
  memberOfListedClub: boolean;
}

/**
 * PRD #3: a moderator manages only a club where they hold a current committee seat; a
 * dept_admin manages their own department's club; a super_admin any club.
 */
export function canManageWith(
  caller: EventCaller,
  clubDepartmentId: number,
  seatInClub: boolean,
): boolean {
  switch (caller.role) {
    case 'super_admin':
      return true;
    case 'dept_admin':
      return caller.departmentId !== null && caller.departmentId === clubDepartmentId;
    case 'moderator':
      return seatInClub;
    default:
      return false;
  }
}

/**
 * PRD #7, the EventDepartment rule: the caller's own department is listed, and they hold an
 * active membership in a club whose department is listed.
 */
export function isEligibleWith(
  caller: EventCaller,
  event: Pick<EventFacts, 'departmentIds'>,
  memberOfListedClub: boolean,
): boolean {
  return (
    caller.departmentId !== null &&
    event.departmentIds.includes(caller.departmentId) &&
    memberOfListedClub
  );
}

/**
 * FR-EVENT-006. Drafts: organizers only. Public: anyone signed in. Members-only: organizers,
 * a dept_admin of a listed department, and eligible members.
 */
export function canSeeWith(caller: EventCaller, event: EventFacts, facts: CallerFacts): boolean {
  const manages = canManageWith(caller, event.clubDepartmentId, facts.seatInOrganizerClub);
  if (event.status === 'draft') return manages;
  if (event.visibility === 'public' || manages) return true;
  if (
    caller.role === 'dept_admin' &&
    caller.departmentId !== null &&
    event.departmentIds.includes(caller.departmentId)
  ) {
    return true;
  }
  return isEligibleWith(caller, event, facts.memberOfListedClub);
}

export const eventAccess = {
  /** Loads the caller facts for one event. Skips the queries the caller's role makes moot. */
  async callerFacts(db: Db, caller: EventCaller, event: EventFacts): Promise<CallerFacts> {
    const [seatInOrganizerClub, memberOfListedClub] = await Promise.all([
      caller.role === 'moderator'
        ? committeeRepository.hasCurrentPosition(db, caller.id, event.organizerClubId)
        : Promise.resolve(false),
      caller.role !== 'super_admin' &&
      caller.departmentId !== null &&
      event.departmentIds.includes(caller.departmentId)
        ? hasMembershipInDepartments(db, caller.id, event.departmentIds)
        : Promise.resolve(false),
    ]);
    return { seatInOrganizerClub, memberOfListedClub };
  },

  /** Whether the caller manages a club (create, before an event exists). */
  async canManageClub(db: Db, caller: EventCaller, clubId: number, clubDepartmentId: number) {
    const seat =
      caller.role === 'moderator' &&
      (await committeeRepository.hasCurrentPosition(db, caller.id, clubId));
    return canManageWith(caller, clubDepartmentId, seat);
  },
};

/** An active membership (`end_date` today or later, Dhaka) in a club of one of `departmentIds`. */
async function hasMembershipInDepartments(
  db: Db,
  userId: string,
  departmentIds: readonly number[],
): Promise<boolean> {
  const count = await db.clubMembership.count({
    where: {
      userId,
      status: 'active',
      endDate: { gte: toDbDate(todayInDhaka()) },
      club: { departmentId: { in: [...departmentIds] } },
    },
  });
  return count > 0;
}
