import {
  AUDIT_ACTIONS,
  paginationMeta,
  type AssignDeptAdminInput,
  type DeptAdminTerm,
  type DeptAdminTermListQuery,
  type Paginated,
  type RenewDeptAdminInput,
} from '@uniconnect/shared';
import { env } from '../../config/env.js';
import { fromDbDate, todayInDhaka, toDbDate } from '../../lib/dates.js';
import { AppError, badRequest, conflict } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { isUniqueViolation, violatedIndex } from '../../lib/prisma-errors.js';
import { prisma } from '../../lib/prisma.js';
import { enqueueEmail } from '../../queues/email.queue.js';
import type { Db } from '../../repositories/audit.repository.js';
import { roleRepository } from '../../repositories/role.repository.js';
import { auditService } from '../../services/audit.service.js';
import { roleService } from '../../services/role.service.js';
import { deptAdminTermRepository, type TermRow } from './dept-admin-term.repository.js';

// Lock order everywhere (DECISIONS D12, D34): department → user → term row.

/** The super_admin making the request. */
export interface TermCaller {
  id: string;
  ip: string | null;
}

const TERM_NOT_FOUND = () =>
  new AppError(404, 'DEPT_ADMIN_TERM_NOT_FOUND', 'Department admin term not found.');
const USER_NOT_FOUND = () => new AppError(404, 'USER_NOT_FOUND', 'User not found.');
const DEPARTMENT_HAS_ADMIN = () =>
  conflict(
    'DEPARTMENT_HAS_ADMIN',
    'This department already has a current admin. End or renew that term first.',
  );
const USER_HAS_ADMIN_TERM = () =>
  conflict('USER_HAS_ADMIN_TERM', 'This user already holds a current admin term.');
const TERM_ALREADY_ENDED = () =>
  conflict('TERM_ALREADY_ENDED', 'This department admin term has already ended.');
const USER_SUSPENDED = () => conflict('USER_SUSPENDED', 'A suspended user cannot be assigned.');

/** The partial unique indexes on department_admin_terms (DECISIONS §3), each with its 409. */
const TERM_INDEXES = {
  dept_admin_one_current_per_dept: DEPARTMENT_HAS_ADMIN,
  dept_admin_one_current_per_user: USER_HAS_ADMIN_TERM,
} as const;

const JOB_BATCH = 100;

export function toDeptAdminTerm(row: TermRow): DeptAdminTerm {
  return {
    id: row.id,
    start_date: fromDbDate(row.startDate),
    end_date: fromDbDate(row.endDate),
    is_current: row.isCurrent,
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      avatar_url: row.user.image,
    },
    department: row.department,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** A current term must be running today (Asia/Dhaka): start ≤ today ≤ end. */
function assertRunningToday(input: { start_date: string; end_date: string }) {
  const today = todayInDhaka();
  const issues = [];
  if (input.start_date > today) {
    issues.push({ path: 'start_date', message: 'The term cannot start in the future.' });
  }
  if (input.end_date < today) {
    issues.push({ path: 'end_date', message: 'The term must end today or later.' });
  }
  if (issues.length > 0) {
    throw badRequest('VALIDATION_ERROR', 'A current term must include today.', issues);
  }
}

/** Maps a P2002 from the term inserts to its specific 409. */
function mapUniqueViolation(err: unknown): never {
  if (isUniqueViolation(err)) {
    const index = violatedIndex(err, Object.keys(TERM_INDEXES) as (keyof typeof TERM_INDEXES)[]);
    throw (index ? TERM_INDEXES[index] : DEPARTMENT_HAS_ADMIN)();
  }
  throw err;
}

/**
 * Ends one current term inside `tx`: user lock, then term lock, then a re-check, so a
 * concurrent end (another admin, or the daily job) is seen. False when already ended.
 */
async function endInTx(
  tx: Db,
  row: TermRow,
  actorId: string | null,
  ip: string | null,
): Promise<boolean> {
  await roleRepository.lockUser(tx, row.userId);
  await deptAdminTermRepository.lockTerm(tx, row.id);
  const locked = await deptAdminTermRepository.findById(tx, row.id);
  if (!locked?.isCurrent) return false;

  await deptAdminTermRepository.setNotCurrent(tx, row.id);
  await auditService.record(tx, {
    userId: actorId,
    action: AUDIT_ACTIONS.END_DEPT_ADMIN_TERM,
    entityType: 'department_admin_term',
    entityId: row.id,
    oldValue: { is_current: true },
    newValue: {
      is_current: false,
      user_id: row.userId,
      department_id: row.departmentId,
      ...(actorId === null ? { reason: 'term_expired' } : {}),
    },
    ipAddress: ip,
  });
  // moderator if a committee row is still current, otherwise faculty (PRD FR-ADMIN-002).
  await roleService.recompute(tx, row.userId, actorId);
  return true;
}

export const deptAdminTermService = {
  /** FR-ADMIN-004. */
  async list(q: DeptAdminTermListQuery): Promise<Paginated<DeptAdminTerm>> {
    const { rows, total } = await deptAdminTermRepository.list(prisma, q);
    return { data: rows.map(toDeptAdminTerm), meta: paginationMeta(q.page, q.limit, total) };
  },

  /**
   * FR-ADMIN-001. One transaction: checks, insert, audit, role recompute (→ dept_admin). The
   * "assigned" email is queued after commit, so a rollback never sends one.
   */
  async assign(caller: TermCaller, input: AssignDeptAdminInput): Promise<DeptAdminTerm> {
    assertRunningToday(input);

    let term: TermRow;
    try {
      term = await prisma.$transaction(async (tx) => {
        if (!(await deptAdminTermRepository.lockDepartment(tx, input.department_id))) {
          throw badRequest('DEPARTMENT_NOT_FOUND', 'Department not found.', [
            { path: 'department_id', message: 'Department not found.' },
          ]);
        }
        if (!(await roleRepository.lockUser(tx, input.user_id))) throw USER_NOT_FOUND();
        const user = await deptAdminTermRepository.findUserForAssignment(tx, input.user_id);
        if (!user) throw USER_NOT_FOUND();
        // user_type, not role: a faculty member who is a moderator still qualifies.
        if (user.userType !== 'faculty') {
          throw badRequest('NOT_FACULTY', 'Only faculty members can be department admins.');
        }
        if (user.departmentId !== input.department_id) {
          throw badRequest(
            'USER_NOT_IN_DEPARTMENT',
            'A department admin must belong to that department.',
          );
        }
        if (!user.isActive) throw USER_SUSPENDED();
        if (await deptAdminTermRepository.departmentHasCurrentAdmin(tx, input.department_id)) {
          throw DEPARTMENT_HAS_ADMIN();
        }
        if (await deptAdminTermRepository.userHasCurrentTerm(tx, user.id)) {
          throw USER_HAS_ADMIN_TERM();
        }

        const row = await deptAdminTermRepository.insert(tx, {
          userId: user.id,
          departmentId: input.department_id,
          startDate: toDbDate(input.start_date),
          endDate: toDbDate(input.end_date),
          isCurrent: true,
        });
        await auditService.record(tx, {
          userId: caller.id,
          action: AUDIT_ACTIONS.ASSIGN_DEPT_ADMIN,
          entityType: 'department_admin_term',
          entityId: row.id,
          newValue: {
            user_id: user.id,
            department_id: input.department_id,
            start_date: input.start_date,
            end_date: input.end_date,
          },
          ipAddress: caller.ip,
        });
        await roleService.recompute(tx, user.id, caller.id);
        return row;
      });
    } catch (err) {
      mapUniqueViolation(err);
    }

    try {
      await enqueueEmail({
        kind: 'dept-admin-assigned',
        to: term.user.email,
        name: term.user.name,
        departmentName: term.department.name,
        startDate: fromDbDate(term.startDate),
        endDate: fromDbDate(term.endDate),
        url: `${env.FRONTEND_ORIGIN}/dashboard`,
      });
    } catch (err) {
      // The term is committed; a queue outage must not undo it.
      logger.error(`dept admin email not queued: ${(err as Error).message}`);
    }
    return toDeptAdminTerm(term);
  },

  /** FR-ADMIN-002. One transaction: is_current = false, audit, role recompute. */
  async end(caller: TermCaller, id: number): Promise<DeptAdminTerm> {
    await prisma.$transaction(async (tx) => {
      const row = await deptAdminTermRepository.findById(tx, id);
      if (!row) throw TERM_NOT_FOUND();
      if (!(await endInTx(tx, row, caller.id, caller.ip))) throw TERM_ALREADY_ENDED();
    });
    const row = await deptAdminTermRepository.findById(prisma, id);
    if (!row) throw TERM_NOT_FOUND();
    return toDeptAdminTerm(row);
  },

  /**
   * FR-ADMIN-003. One transaction: the old term stops being current, the new one is inserted,
   * the role is recomputed (stays dept_admin). The two rows are never current together, which
   * the partial unique indexes require.
   */
  async renew(caller: TermCaller, id: number, input: RenewDeptAdminInput): Promise<DeptAdminTerm> {
    assertRunningToday(input);
    try {
      const term = await prisma.$transaction(async (tx) => {
        const found = await deptAdminTermRepository.findById(tx, id);
        if (!found) throw TERM_NOT_FOUND();

        await deptAdminTermRepository.lockDepartment(tx, found.departmentId);
        await roleRepository.lockUser(tx, found.userId);
        await deptAdminTermRepository.lockTerm(tx, id);
        const old = await deptAdminTermRepository.findById(tx, id);
        if (!old?.isCurrent) {
          throw conflict('TERM_NOT_CURRENT', 'Only a current term can be renewed.');
        }
        const user = await deptAdminTermRepository.findUserForAssignment(tx, old.userId);
        if (!user?.isActive) throw USER_SUSPENDED();

        await deptAdminTermRepository.setNotCurrent(tx, id);
        const row = await deptAdminTermRepository.insert(tx, {
          userId: old.userId,
          departmentId: old.departmentId,
          startDate: toDbDate(input.start_date),
          endDate: toDbDate(input.end_date),
          isCurrent: true,
        });
        await auditService.record(tx, {
          userId: caller.id,
          action: AUDIT_ACTIONS.RENEW_DEPT_ADMIN_TERM,
          entityType: 'department_admin_term',
          entityId: row.id,
          oldValue: {
            term_id: old.id,
            start_date: fromDbDate(old.startDate),
            end_date: fromDbDate(old.endDate),
          },
          newValue: {
            term_id: row.id,
            user_id: old.userId,
            department_id: old.departmentId,
            start_date: input.start_date,
            end_date: input.end_date,
          },
          ipAddress: caller.ip,
        });
        await roleService.recompute(tx, old.userId, caller.id);
        return row;
      });
      return toDeptAdminTerm(term);
    } catch (err) {
      mapUniqueViolation(err);
    }
  },

  /**
   * FR-ADMIN-005 `expire-dept-admin-terms`: ends current terms whose `end_date` (the last day)
   * is before today in Asia/Dhaka. One transaction per term, through the same path as the
   * endpoint (actor = system). Safe to run twice.
   */
  async expireTerms(now: Date = new Date()): Promise<number> {
    const today = toDbDate(todayInDhaka(now));
    let ended = 0;
    let afterId = 0;
    for (;;) {
      const ids = await deptAdminTermRepository.findExpiredIds(prisma, today, afterId, JOB_BATCH);
      for (const id of ids) {
        try {
          const done = await prisma.$transaction(async (tx) => {
            const row = await deptAdminTermRepository.findById(tx, id);
            return row ? endInTx(tx, row, null, null) : false;
          });
          if (done) ended += 1;
        } catch (err) {
          logger.error(`dept admin term ${id} not expired: ${(err as Error).message}`);
        }
      }
      if (ids.length < JOB_BATCH) break;
      afterId = ids[ids.length - 1] as number;
    }
    return ended;
  },
};
