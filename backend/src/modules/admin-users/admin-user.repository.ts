import { AUDIT_ACTIONS, type AdminUserListQuery } from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';
import { PROFILE_SELECT } from '../users/user.repository.js';

/** The columns of one list row. An allowlist, like PROFILE_SELECT. */
export const SUMMARY_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
  userType: true,
  role: true,
  department: { select: { id: true, name: true } },
  isActive: true,
  emailVerified: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type SummaryRow = Prisma.UserGetPayload<{ select: typeof SUMMARY_SELECT }>;

const SORT_COLUMN = { created_at: 'createdAt', name: 'name', email: 'email' } as const;

function whereOf(q: AdminUserListQuery): Prisma.UserWhereInput {
  return {
    ...(q.role && { role: q.role }),
    ...(q.user_type && { userType: q.user_type }),
    ...(q.department_id && { departmentId: q.department_id }),
    ...(q.is_active !== undefined && { isActive: q.is_active }),
    ...(q.search && {
      OR: [
        { name: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
      ],
    }),
  };
}

export const adminUserRepository = {
  async list(db: Db, q: AdminUserListQuery) {
    const where = whereOf(q);
    const [rows, total] = await Promise.all([
      db.user.findMany({
        where,
        select: SUMMARY_SELECT,
        // id breaks ties, so a page boundary never repeats or skips a row.
        orderBy: [{ [SORT_COLUMN[q.sort]]: q.order }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      db.user.count({ where }),
    ]);
    return { rows, total };
  },

  findProfile(db: Db, id: string) {
    return db.user.findUnique({ where: { id }, select: PROFILE_SELECT });
  },

  countActiveSessions(db: Db, userId: string, now = new Date()) {
    return db.session.count({ where: { userId, expiresAt: { gt: now } } });
  },

  async lastLoginAt(db: Db, userId: string): Promise<Date | null> {
    const row = await db.auditLog.findFirst({
      where: { userId, action: AUDIT_ACTIONS.LOGIN },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  },

  currentCommittee(db: Db, userId: string) {
    return db.clubCommitteeMember.findMany({
      where: { userId, isCurrent: true },
      select: {
        position: true,
        termStartYear: true,
        termEndYear: true,
        club: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  currentAdminTerm(db: Db, userId: string) {
    return db.departmentAdminTerm.findFirst({
      where: { userId, isCurrent: true },
      select: {
        startDate: true,
        endDate: true,
        department: { select: { id: true, name: true } },
      },
    });
  },

  /** Rows that tie the user to their current department: terms and open memberships. */
  async hasDepartmentBoundRows(db: Db, userId: string): Promise<boolean> {
    const [committee, adminTerms, memberships] = await Promise.all([
      db.clubCommitteeMember.count({ where: { userId, isCurrent: true } }),
      db.departmentAdminTerm.count({ where: { userId, isCurrent: true } }),
      db.clubMembership.count({ where: { userId, status: { in: ['active', 'pending'] } } }),
    ]);
    return committee + adminTerms + memberships > 0;
  },

  async departmentExists(db: Db, id: number): Promise<boolean> {
    return (await db.department.count({ where: { id } })) > 0;
  },

  setActive(db: Db, id: string, isActive: boolean) {
    return db.user.update({ where: { id }, data: { isActive }, select: { id: true } });
  },

  async deleteSessions(db: Db, userId: string): Promise<number> {
    return (await db.session.deleteMany({ where: { userId } })).count;
  },

  updateUser(db: Db, id: string, data: Prisma.UserUncheckedUpdateInput) {
    return db.user.update({ where: { id }, data, select: { id: true } });
  },
};
