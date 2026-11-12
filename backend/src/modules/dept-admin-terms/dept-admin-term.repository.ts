import type { DeptAdminTermListQuery } from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';

/** The columns of a term in a response. An allowlist: super_admin only, so email is included. */
export const TERM_SELECT = {
  id: true,
  userId: true,
  departmentId: true,
  startDate: true,
  endDate: true,
  isCurrent: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true, image: true } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.DepartmentAdminTermSelect;

export type TermRow = Prisma.DepartmentAdminTermGetPayload<{ select: typeof TERM_SELECT }>;

export const deptAdminTermRepository = {
  async list(db: Db, q: DeptAdminTermListQuery) {
    const where: Prisma.DepartmentAdminTermWhereInput = {
      ...(q.department_id === undefined ? {} : { departmentId: q.department_id }),
      ...(q.user_id === undefined ? {} : { userId: q.user_id }),
      ...(q.is_current === undefined ? {} : { isCurrent: q.is_current }),
    };
    const [rows, total] = await Promise.all([
      db.departmentAdminTerm.findMany({
        where,
        select: TERM_SELECT,
        // Current terms first, then the latest; id breaks ties so pages never overlap.
        orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      db.departmentAdminTerm.count({ where }),
    ]);
    return { rows, total };
  },

  findById(db: Db, id: number) {
    return db.departmentAdminTerm.findUnique({ where: { id }, select: TERM_SELECT });
  },

  /**
   * Locks the department row, so two assignments to one department run one after the other
   * and the second sees the first's term (DECISIONS D34). False when it doesn't exist.
   */
  async lockDepartment(db: Db, id: number): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM departments WHERE id = ${id} FOR UPDATE`;
    return rows.length > 0;
  },

  async lockTerm(db: Db, id: number): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: number }[]>`
      SELECT id FROM department_admin_terms WHERE id = ${id} FOR UPDATE`;
    return rows.length > 0;
  },

  findUserForAssignment(db: Db, userId: string) {
    return db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        userType: true,
        departmentId: true,
        isActive: true,
      },
    });
  },

  async departmentHasCurrentAdmin(db: Db, departmentId: number) {
    return (await db.departmentAdminTerm.count({ where: { departmentId, isCurrent: true } })) > 0;
  },

  async userHasCurrentTerm(db: Db, userId: string) {
    return (await db.departmentAdminTerm.count({ where: { userId, isCurrent: true } })) > 0;
  },

  insert(db: Db, data: Prisma.DepartmentAdminTermUncheckedCreateInput) {
    return db.departmentAdminTerm.create({ data, select: TERM_SELECT });
  },

  setNotCurrent(db: Db, id: number) {
    return db.departmentAdminTerm.update({
      where: { id },
      data: { isCurrent: false },
      select: { id: true },
    });
  },

  /**
   * Ids (> `afterId`, ascending) of current terms whose last day is before `today`. Not
   * locked: the job locks and re-checks each term in its own transaction.
   */
  async findExpiredIds(db: Db, today: Date, afterId: number, take: number): Promise<number[]> {
    const rows = await db.departmentAdminTerm.findMany({
      where: { isCurrent: true, endDate: { lt: today }, id: { gt: afterId } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take,
    });
    return rows.map((r) => r.id);
  },
};
