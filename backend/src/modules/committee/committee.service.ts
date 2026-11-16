import {
  AUDIT_ACTIONS,
  paginationMeta,
  type AssignCommitteeInput,
  type CommitteeCandidate,
  type CommitteeCandidateQuery,
  type CommitteeEntry,
  type CommitteeListQuery,
  type Paginated,
  type UpdateCommitteeInput,
} from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { todayInDhaka } from '../../lib/dates.js';
import { AppError, badRequest, conflict, forbidden } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { prisma } from '../../lib/prisma.js';
import type { Db } from '../../repositories/audit.repository.js';
import { roleRepository } from '../../repositories/role.repository.js';
import { auditService } from '../../services/audit.service.js';
import { roleService } from '../../services/role.service.js';
import { clubRepository } from '../clubs/club.repository.js';
import type { ClubCaller } from '../clubs/club.service.js';
import {
  committeeRepository,
  type CommitteeRow,
  type CommitteeUpdateData,
} from './committee.repository.js';

// Lock order everywhere (DECISIONS D12, D34): club → user → committee row. Every path that
// takes more than one of these locks takes them in this order, so two of them never deadlock.

const CLUB_NOT_FOUND = () => new AppError(404, 'CLUB_NOT_FOUND', 'Club not found.');
const MEMBER_NOT_FOUND = () =>
  new AppError(404, 'COMMITTEE_MEMBER_NOT_FOUND', 'Committee member not found.');
const USER_NOT_FOUND = () => new AppError(404, 'USER_NOT_FOUND', 'User not found.');
const ALREADY_ON_COMMITTEE = () =>
  conflict('ALREADY_ON_COMMITTEE', 'This user already holds a current position in this club.');
const TERM_ALREADY_ENDED = () =>
  conflict('TERM_ALREADY_ENDED', 'This committee term has already ended.');
const END_BEFORE_START = 'The end year cannot be before the start year.';
const TERM_IN_PAST = 'A current term must end this year or later.';

/** Batch size for the expiry job's id scan. Each id still gets its own transaction. */
const JOB_BATCH = 100;

const currentYear = (now: Date = new Date()) => Number(todayInDhaka(now).slice(0, 4));

export function toCommitteeEntry(row: CommitteeRow): CommitteeEntry {
  return {
    id: row.id,
    club_id: row.clubId,
    position: row.position,
    term_start_year: row.termStartYear,
    term_end_year: row.termEndYear,
    is_current: row.isCurrent,
    user: { id: row.user.id, name: row.user.name, avatar_url: row.user.image },
    updated_at: row.updatedAt.toISOString(),
  };
}

/**
 * The route's requireDepartmentScope already checked this; the service repeats it so it is
 * safe on its own (as clubService.lockForEdit does).
 */
function assertCanManage(caller: ClubCaller, clubDepartmentId: number) {
  if (caller.role === 'super_admin') return;
  if (caller.role !== 'dept_admin' || caller.departmentId !== clubDepartmentId) throw forbidden();
}

/** API field → Prisma field for PATCH. Nothing else can be written. */
const FIELD_MAP = {
  position: 'position',
  term_start_year: 'termStartYear',
  term_end_year: 'termEndYear',
} as const satisfies Record<keyof UpdateCommitteeInput, keyof CommitteeUpdateData>;

type ApiField = keyof typeof FIELD_MAP;

/**
 * Ends one current committee row inside `tx`: user lock, then row lock, then a re-check, so a
 * concurrent end (another admin, or the daily job) is seen. Returns false when the row was
 * already ended. `actorId` null = the system job.
 */
async function endInTx(
  tx: Db,
  row: CommitteeRow,
  actorId: string | null,
  ip: string | null,
): Promise<boolean> {
  await roleRepository.lockUser(tx, row.userId);
  await committeeRepository.lockMember(tx, row.id);
  const locked = await committeeRepository.findById(tx, row.id);
  if (!locked?.isCurrent) return false;

  await committeeRepository.setNotCurrent(tx, row.id);
  await auditService.record(tx, {
    userId: actorId,
    action: AUDIT_ACTIONS.END_COMMITTEE_TERM,
    entityType: 'club_committee_member',
    entityId: row.id,
    oldValue: { is_current: true },
    newValue: {
      is_current: false,
      user_id: row.userId,
      club_id: row.clubId,
      position: locked.position,
      ...(actorId === null ? { reason: 'term_expired' } : {}),
    },
    ipAddress: ip,
  });
  // Derived from every remaining term: falls back to user_type only if nothing else is current.
  await roleService.recompute(tx, row.userId, actorId);
  return true;
}

export const committeeService = {
  /** FR-COMM-001. Any signed-in user; past terms are included unless filtered out. */
  async list(clubId: number, q: CommitteeListQuery): Promise<Paginated<CommitteeEntry>> {
    if ((await clubRepository.findDepartmentId(prisma, clubId)) === null) throw CLUB_NOT_FOUND();
    const { rows, total } = await committeeRepository.list(
      prisma,
      clubId,
      q.is_current,
      q.page,
      q.limit,
    );
    return { data: rows.map(toCommitteeEntry), meta: paginationMeta(q.page, q.limit, total) };
  },

  /**
   * People the club's editors can assign (DECISIONS D34): active students and faculty of the
   * club's department. The route already checked the caller; repeated here as everywhere else.
   */
  async candidates(
    caller: ClubCaller,
    clubId: number,
    q: CommitteeCandidateQuery,
  ): Promise<CommitteeCandidate[]> {
    const departmentId = await clubRepository.findDepartmentId(prisma, clubId);
    if (departmentId === null) throw CLUB_NOT_FOUND();
    assertCanManage(caller, departmentId);
    const rows = await committeeRepository.findCandidates(
      prisma,
      departmentId,
      clubId,
      q.search,
      q.limit,
    );
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      avatar_url: u.image,
      user_type: u.userType as CommitteeCandidate['user_type'],
      student_id: u.studentId,
      on_committee: u.committeePositions.length > 0,
    }));
  },

  /** FR-COMM-002. One transaction: insert, audit, role recompute (student/faculty → moderator). */
  async assign(
    caller: ClubCaller,
    clubId: number,
    input: AssignCommitteeInput,
  ): Promise<CommitteeEntry> {
    try {
      return await prisma.$transaction(async (tx) => {
        if (!(await clubRepository.lockClub(tx, clubId))) throw CLUB_NOT_FOUND();
        const clubDepartmentId = await clubRepository.findDepartmentId(tx, clubId);
        if (clubDepartmentId === null) throw CLUB_NOT_FOUND();
        assertCanManage(caller, clubDepartmentId);

        // Read the user only after locking it, so a concurrent department move can't slip in.
        if (!(await roleRepository.lockUser(tx, input.user_id))) throw USER_NOT_FOUND();
        const user = await committeeRepository.findUserForAssignment(tx, input.user_id);
        if (!user) throw USER_NOT_FOUND();
        if (user.userType !== 'student' && user.userType !== 'faculty') {
          throw badRequest(
            'INVALID_COMMITTEE_USER',
            'Only students and faculty can hold a committee position.',
          );
        }
        if (user.departmentId !== clubDepartmentId) {
          throw badRequest(
            'USER_NOT_IN_CLUB_DEPARTMENT',
            "The user must belong to the club's department.",
          );
        }
        if (!user.isActive) {
          throw conflict('USER_SUSPENDED', 'A suspended user cannot be assigned.');
        }
        if (input.is_current) {
          if (input.term_end_year < currentYear()) {
            throw badRequest('VALIDATION_ERROR', TERM_IN_PAST, [
              { path: 'term_end_year', message: TERM_IN_PAST },
            ]);
          }
          if (await committeeRepository.hasCurrentPosition(tx, user.id, clubId)) {
            throw ALREADY_ON_COMMITTEE();
          }
        }

        const row = await committeeRepository.insert(tx, {
          userId: user.id,
          clubId,
          position: input.position,
          termStartYear: input.term_start_year,
          termEndYear: input.term_end_year,
          isCurrent: input.is_current,
        });
        await auditService.record(tx, {
          userId: caller.id,
          action: AUDIT_ACTIONS.ASSIGN_COMMITTEE_MEMBER,
          entityType: 'club_committee_member',
          entityId: row.id,
          newValue: {
            user_id: user.id,
            club_id: clubId,
            position: row.position,
            term_start_year: row.termStartYear,
            term_end_year: row.termEndYear,
            is_current: row.isCurrent,
          },
          ipAddress: caller.ip,
        });
        await roleService.recompute(tx, user.id, caller.id);
        return toCommitteeEntry(row);
      });
    } catch (err) {
      // The only unique index this insert can hit is one_current_position_per_user_club.
      if (isUniqueViolation(err)) throw ALREADY_ON_COMMITTEE();
      throw err;
    }
  },

  /** FR-COMM-004. Position and years only; the role never changes here. No-op writes nothing. */
  async update(
    caller: ClubCaller,
    clubId: number,
    memberId: number,
    patch: UpdateCommitteeInput,
  ): Promise<CommitteeEntry> {
    return prisma.$transaction(async (tx) => {
      const clubDepartmentId = await clubRepository.findDepartmentId(tx, clubId);
      if (clubDepartmentId === null) throw CLUB_NOT_FOUND();
      assertCanManage(caller, clubDepartmentId);

      if (!(await committeeRepository.lockMember(tx, memberId))) throw MEMBER_NOT_FOUND();
      const before = await committeeRepository.findById(tx, memberId);
      if (!before || before.clubId !== clubId) throw MEMBER_NOT_FOUND();

      const start = patch.term_start_year ?? before.termStartYear;
      const end = patch.term_end_year ?? before.termEndYear;
      if (end < start) {
        throw badRequest('VALIDATION_ERROR', END_BEFORE_START, [
          { path: 'term_end_year', message: END_BEFORE_START },
        ]);
      }
      if (before.isCurrent && patch.term_end_year !== undefined && end < currentYear()) {
        throw badRequest('VALIDATION_ERROR', TERM_IN_PAST, [
          { path: 'term_end_year', message: TERM_IN_PAST },
        ]);
      }

      const data: CommitteeUpdateData = {};
      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      for (const field of Object.keys(patch) as ApiField[]) {
        const column = FIELD_MAP[field];
        const next = patch[field];
        if (next === undefined || next === before[column]) continue;
        (data as Record<string, unknown>)[column] = next;
        oldValue[field] = before[column];
        newValue[field] = next;
      }
      if (Object.keys(data).length === 0) return toCommitteeEntry(before);

      const row = await committeeRepository.update(tx, memberId, data);
      await auditService.record(tx, {
        userId: caller.id,
        action: AUDIT_ACTIONS.COMMITTEE_MEMBER_UPDATED,
        entityType: 'club_committee_member',
        entityId: memberId,
        oldValue: oldValue as Prisma.InputJsonValue,
        newValue: newValue as Prisma.InputJsonValue,
        ipAddress: caller.ip,
      });
      return toCommitteeEntry(row);
    });
  },

  /** FR-COMM-003. One transaction: is_current = false, audit, role recompute. */
  async endTerm(caller: ClubCaller, clubId: number, memberId: number): Promise<CommitteeEntry> {
    await prisma.$transaction(async (tx) => {
      const clubDepartmentId = await clubRepository.findDepartmentId(tx, clubId);
      if (clubDepartmentId === null) throw CLUB_NOT_FOUND();
      assertCanManage(caller, clubDepartmentId);

      const row = await committeeRepository.findById(tx, memberId);
      if (!row || row.clubId !== clubId) throw MEMBER_NOT_FOUND();
      if (!(await endInTx(tx, row, caller.id, caller.ip))) throw TERM_ALREADY_ENDED();
    });
    const row = await committeeRepository.findById(prisma, memberId);
    if (!row) throw MEMBER_NOT_FOUND();
    return toCommitteeEntry(row);
  },

  /**
   * FR-ADMIN-005 `expire-committee-terms`: ends current rows whose `term_end_year` is before
   * the current year in Asia/Dhaka. One transaction per row through the same path as the
   * endpoint (actor = system), so a failure on one row leaves the rest. Safe to run twice.
   */
  async expireTerms(now: Date = new Date()): Promise<number> {
    const year = currentYear(now);
    let ended = 0;
    // An id cursor: a row that fails is skipped (and retried on the next run), never looped on.
    let afterId = 0;
    for (;;) {
      const ids = await committeeRepository.findExpiredIds(prisma, year, afterId, JOB_BATCH);
      for (const id of ids) {
        try {
          const done = await prisma.$transaction(async (tx) => {
            const row = await committeeRepository.findById(tx, id);
            return row ? endInTx(tx, row, null, null) : false;
          });
          if (done) ended += 1;
        } catch (err) {
          logger.error(`committee term ${id} not expired: ${(err as Error).message}`);
        }
      }
      if (ids.length < JOB_BATCH) break;
      afterId = ids[ids.length - 1] as number;
    }
    return ended;
  },
};
