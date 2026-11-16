import { toDbDate, todayInDhaka } from '../../lib/dates.js';
import type { Db } from '../../repositories/audit.repository.js';

// Who may see, post, manage and pin announcements (PRD FR-ANNOUNCE-001–004; DECISIONS D15,
// D38). The rules are pure functions over facts loaded once per request, so they can be
// unit-tested. `visibleScope` is the one place that decides the feed, so the Phase 9 chatbot
// can apply exactly the same filter.

export interface AnnouncementCaller {
  id: string;
  role: string;
  departmentId: number | null;
  ip: string | null;
}

/** The parts of an announcement the rules read. Exactly one of clubId / departmentId is set. */
export interface AnnouncementFacts {
  clubId: number | null;
  departmentId: number | null;
  /** The club's department, for a club post. */
  clubDepartmentId: number | null;
  authorId: string;
}

/**
 * What the caller may read (D15): everything for a super_admin; otherwise posts of their own
 * department, plus posts of clubs where they hold an active membership or a current committee
 * seat, plus (dept_admin) their department's club. `seatClubIds` is kept apart because it
 * also decides whether a moderator still manages their own posts.
 */
export type VisibleScope =
  | { all: true; seatClubIds: readonly number[] }
  | {
      all: false;
      departmentIds: readonly number[];
      clubIds: readonly number[];
      seatClubIds: readonly number[];
    };

/** Where a new announcement would go. */
export type CreateTarget =
  | { kind: 'club'; clubId: number; clubDepartmentId: number }
  | { kind: 'department'; departmentId: number };

/** Roles that may pin (FR-ANNOUNCE-004), including `is_pinned` on create (D38). */
export const PIN_ROLES: readonly string[] = ['dept_admin', 'super_admin'];

/** The department an announcement belongs to: its own, or its club's. */
const homeDepartment = (row: AnnouncementFacts) => row.departmentId ?? row.clubDepartmentId;

export function canSeeWith(row: AnnouncementFacts, scope: VisibleScope): boolean {
  if (scope.all) return true;
  if (row.departmentId !== null) return scope.departmentIds.includes(row.departmentId);
  return row.clubId !== null && scope.clubIds.includes(row.clubId);
}

/** dept_admin of the announcement's department, or super_admin. */
export function canPinWith(caller: AnnouncementCaller, row: AnnouncementFacts): boolean {
  if (caller.role === 'super_admin') return true;
  return (
    caller.role === 'dept_admin' &&
    caller.departmentId !== null &&
    homeDepartment(row) === caller.departmentId
  );
}

/**
 * FR-ANNOUNCE-003: super_admin; the dept_admin of its department; or a moderator who wrote
 * this club post and still holds a current seat in that club.
 */
export function canManageWith(
  caller: AnnouncementCaller,
  row: AnnouncementFacts,
  seatInClub: boolean,
): boolean {
  if (canPinWith(caller, row)) return true;
  return (
    caller.role === 'moderator' && row.authorId === caller.id && row.clubId !== null && seatInClub
  );
}

/**
 * FR-ANNOUNCE-001: a moderator posts only to a club where they hold a current seat, never to a
 * department; a dept_admin to their own department or its club; a super_admin anywhere.
 */
export function canCreateWith(
  caller: AnnouncementCaller,
  target: CreateTarget,
  seatInClub: boolean,
): boolean {
  switch (caller.role) {
    case 'super_admin':
      return true;
    case 'dept_admin': {
      const dept = target.kind === 'club' ? target.clubDepartmentId : target.departmentId;
      return caller.departmentId !== null && dept === caller.departmentId;
    }
    case 'moderator':
      return target.kind === 'club' && seatInClub;
    default:
      return false;
  }
}

/** Loads the caller's {@link VisibleScope}: three small queries, none for a super_admin seat. */
export async function visibleScope(db: Db, caller: AnnouncementCaller): Promise<VisibleScope> {
  const seats = await db.clubCommitteeMember.findMany({
    where: { userId: caller.id, isCurrent: true },
    select: { clubId: true },
  });
  const seatClubIds = seats.map((s) => s.clubId);
  if (caller.role === 'super_admin') return { all: true, seatClubIds };

  const [memberships, deptClubs] = await Promise.all([
    db.clubMembership.findMany({
      where: {
        userId: caller.id,
        status: 'active',
        endDate: { gte: toDbDate(todayInDhaka()) },
      },
      select: { clubId: true },
    }),
    caller.role === 'dept_admin' && caller.departmentId !== null
      ? db.club.findMany({ where: { departmentId: caller.departmentId }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  const clubIds = new Set([
    ...seatClubIds,
    ...memberships.map((m) => m.clubId),
    ...deptClubs.map((c) => c.id),
  ]);
  return {
    all: false,
    departmentIds: caller.departmentId === null ? [] : [caller.departmentId],
    clubIds: [...clubIds],
    seatClubIds,
  };
}
