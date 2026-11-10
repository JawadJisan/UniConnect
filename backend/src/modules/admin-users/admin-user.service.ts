import {
  ACADEMIC_FIELDS,
  AUDIT_ACTIONS,
  paginationMeta,
  type AdminUpdateUserInput,
  type AdminUserDetail,
  type AdminUserListQuery,
  type AdminUserSummary,
  type Paginated,
  type RecomputeRoleResult,
  type Role,
  type UpdateUserStatusInput,
} from '@uniconnect/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError, badRequest, conflict, notFound } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import type { Db } from '../../repositories/audit.repository.js';
import { roleRepository } from '../../repositories/role.repository.js';
import { auditService } from '../../services/audit.service.js';
import { roleService } from '../../services/role.service.js';
import { userProfileRepository, type ProfileRow } from '../users/user.repository.js';
import { toProfile } from '../users/user.service.js';
import { adminUserRepository, type SummaryRow } from './admin-user.repository.js';

/** The super_admin making the request. */
export interface AdminCaller {
  id: string;
  ip: string | null;
}

const USER_NOT_FOUND = () => notFound('User not found.');
const CANNOT_MODIFY_SELF = () =>
  new AppError(403, 'CANNOT_MODIFY_SELF', 'You cannot change the status of your own account.');
const CANNOT_MODIFY_SUPER_ADMIN = () =>
  new AppError(403, 'CANNOT_MODIFY_SUPER_ADMIN', 'Super admin accounts cannot be changed here.');
const STUDENT_ID_TAKEN = () => conflict('STUDENT_ID_TAKEN', 'Student ID already registered.');
const ACADEMIC_ONLY_STUDENTS = 'Only students have academic details.';

/** API field → Prisma field for PATCH /admin/users/:id. Nothing else can be written. */
const FIELD_MAP = {
  name: 'name',
  phone: 'phone',
  blood_group: 'bloodGroup',
  department_id: 'departmentId',
  academic_session: 'academicSession',
  current_year: 'currentYear',
  current_semester: 'currentSemester',
  student_id: 'studentId',
} as const satisfies Record<keyof AdminUpdateUserInput, keyof ProfileRow>;

type ApiField = keyof typeof FIELD_MAP;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function toSummary(row: SummaryRow): AdminUserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar_url: row.image,
    user_type: row.userType as AdminUserSummary['user_type'],
    role: row.role as AdminUserSummary['role'],
    department: row.department,
    is_active: row.isActive,
    email_verified: row.emailVerified,
    created_at: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Locks the target row (DECISIONS D12) and returns it; 404 when it doesn't exist. */
async function lockTarget(tx: Db, id: string): Promise<ProfileRow> {
  if (!(await roleRepository.lockUser(tx, id))) throw USER_NOT_FOUND();
  const row = await adminUserRepository.findProfile(tx, id);
  if (!row) throw USER_NOT_FOUND();
  return row;
}

async function detailOf(db: Db, id: string): Promise<AdminUserDetail> {
  const row = await adminUserRepository.findProfile(db, id);
  if (!row) throw USER_NOT_FOUND();
  const [activeSessions, lastLogin, committee, adminTerm] = await Promise.all([
    adminUserRepository.countActiveSessions(db, id),
    adminUserRepository.lastLoginAt(db, id),
    adminUserRepository.currentCommittee(db, id),
    adminUserRepository.currentAdminTerm(db, id),
  ]);
  return {
    ...toProfile(row),
    active_sessions: activeSessions,
    last_login_at: lastLogin?.toISOString() ?? null,
    role_sources: {
      committee: committee.map((c) => ({
        club_id: c.club.id,
        club_name: c.club.name,
        position: c.position,
        term_start_year: c.termStartYear,
        term_end_year: c.termEndYear,
      })),
      dept_admin: adminTerm
        ? {
            department_id: adminTerm.department.id,
            department_name: adminTerm.department.name,
            start_date: isoDate(adminTerm.startDate),
            end_date: isoDate(adminTerm.endDate),
          }
        : null,
    },
  };
}

export const adminUserService = {
  async list(query: AdminUserListQuery): Promise<Paginated<AdminUserSummary>> {
    const { rows, total } = await adminUserRepository.list(prisma, query);
    return { data: rows.map(toSummary), meta: paginationMeta(query.page, query.limit, total) };
  },

  detail(id: string): Promise<AdminUserDetail> {
    return detailOf(prisma, id);
  },

  /**
   * Suspend or activate (PRD FR-USER-005). Suspending deletes every session in the same
   * transaction, so the user's cookie stops working on the next request (review M2).
   * Setting the state the user already has changes nothing and writes no audit row.
   */
  async setStatus(
    caller: AdminCaller,
    id: string,
    input: UpdateUserStatusInput,
  ): Promise<AdminUserDetail> {
    await prisma.$transaction(async (tx) => {
      const before = await lockTarget(tx, id);
      if (before.id === caller.id) throw CANNOT_MODIFY_SELF();
      if (before.userType === 'super_admin') throw CANNOT_MODIFY_SUPER_ADMIN();
      if (before.isActive === input.is_active) return;

      await adminUserRepository.setActive(tx, id, input.is_active);
      const sessionsRevoked = input.is_active
        ? 0
        : await adminUserRepository.deleteSessions(tx, id);
      await auditService.record(tx, {
        userId: caller.id,
        action: input.is_active ? AUDIT_ACTIONS.USER_ACTIVATED : AUDIT_ACTIONS.USER_SUSPENDED,
        entityType: 'user',
        entityId: id,
        oldValue: { is_active: before.isActive },
        newValue: {
          is_active: input.is_active,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.is_active ? {} : { sessions_revoked: sessionsRevoked }),
        },
        ipAddress: caller.ip,
      });
    });
    return detailOf(prisma, id);
  },

  /**
   * Repair tool: re-derives the role from user_type and current terms. RoleService writes
   * ROLE_CHANGED (actor = the admin) only when the role actually changes.
   */
  recomputeRole(caller: AdminCaller, id: string): Promise<RecomputeRoleResult> {
    return prisma.$transaction(async (tx) => {
      const before = await lockTarget(tx, id);
      const role = await roleService.recompute(tx, id, caller.id);
      const previous = before.role as Role;
      return { role, previous_role: previous, changed: role !== previous };
    });
  },

  /** super_admin assisting a user (PRD FR-USER-002, DECISIONS D29). */
  async update(
    caller: AdminCaller,
    id: string,
    input: AdminUpdateUserInput,
  ): Promise<AdminUserDetail> {
    const fields = Object.keys(input) as ApiField[];
    try {
      await prisma.$transaction(async (tx) => {
        const before = await lockTarget(tx, id);
        if (before.userType === 'super_admin') throw CANNOT_MODIFY_SUPER_ADMIN();

        if (before.userType !== 'student') {
          const academic = fields.filter((f) => (ACADEMIC_FIELDS as readonly string[]).includes(f));
          if (academic.length > 0) {
            throw badRequest(
              'VALIDATION_ERROR',
              ACADEMIC_ONLY_STUDENTS,
              academic.map((path) => ({ path, message: ACADEMIC_ONLY_STUDENTS })),
            );
          }
        }

        const departmentId = input.department_id ?? before.departmentId;
        if (departmentId !== before.departmentId) {
          if (!(await adminUserRepository.departmentExists(tx, departmentId as number))) {
            throw badRequest('DEPARTMENT_NOT_FOUND', 'Department not found.', [
              { path: 'department_id', message: 'Department not found.' },
            ]);
          }
          if (await adminUserRepository.hasDepartmentBoundRows(tx, id)) {
            throw conflict(
              'DEPARTMENT_CHANGE_BLOCKED',
              "End this user's committee or admin terms and memberships before moving them to another department.",
            );
          }
        }

        // The student ID must be free in the department the user ends up in.
        const studentId = input.student_id ?? before.studentId;
        const idOrDeptChanged =
          studentId !== before.studentId || departmentId !== before.departmentId;
        if (
          before.userType === 'student' &&
          idOrDeptChanged &&
          studentId &&
          departmentId !== null &&
          (await userProfileRepository.studentIdTakenByOther(tx, departmentId, studentId, id))
        ) {
          throw STUDENT_ID_TAKEN();
        }

        const data: Record<string, unknown> = {};
        const oldValue: Record<string, unknown> = {};
        const newValue: Record<string, unknown> = {};
        for (const field of fields) {
          const column = FIELD_MAP[field];
          const value = input[field];
          if (before[column] !== value) {
            data[column] = value;
            oldValue[field] = before[column];
            newValue[field] = value;
          }
        }
        // Nothing actually changed: no write and no audit row.
        if (Object.keys(data).length === 0) return;

        await adminUserRepository.updateUser(tx, id, data as Prisma.UserUncheckedUpdateInput);
        await auditService.record(tx, {
          userId: caller.id,
          action: AUDIT_ACTIONS.USER_UPDATED_BY_ADMIN,
          entityType: 'user',
          entityId: id,
          oldValue: oldValue as Prisma.InputJsonValue,
          newValue: newValue as Prisma.InputJsonValue,
          ipAddress: caller.ip,
        });
      });
    } catch (err) {
      // The only unique index this update can hit is users_student_id_per_dept.
      if (isUniqueViolation(err)) throw STUDENT_ID_TAKEN();
      throw err;
    }
    return detailOf(prisma, id);
  },
};
