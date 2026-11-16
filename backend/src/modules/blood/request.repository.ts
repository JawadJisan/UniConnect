import type { BloodRequestListQuery } from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';

export const REQUEST_SELECT = {
  id: true,
  requesterId: true,
  patientName: true,
  bloodGroup: true,
  unitsNeeded: true,
  reason: true,
  contactPhone: true,
  hospitalName: true,
  requiredByDate: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  // Names only: never an email (FR-BLOOD-004 privacy note applies to requests too).
  requester: {
    select: {
      id: true,
      name: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
    },
  },
  fulfiller: { select: { id: true, name: true } },
} satisfies Prisma.BloodRequestSelect;

export type RequestRow = Prisma.BloodRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

/** Requests have no department column: `department_id` means the requester's (D40). */
export function whereRequests(q: BloodRequestListQuery): Prisma.BloodRequestWhereInput {
  return {
    status: q.status,
    ...(q.blood_group !== undefined ? { bloodGroup: q.blood_group } : {}),
    ...(q.department_id !== undefined ? { requester: { departmentId: q.department_id } } : {}),
  };
}

export interface LockedRequest {
  status: string;
  requester_id: string;
  required_by_date: Date;
  requester_department_id: number | null;
}

export const requestRepository = {
  create(db: Db, data: Prisma.BloodRequestUncheckedCreateInput) {
    return db.bloodRequest.create({ data, select: REQUEST_SELECT });
  },

  findById(db: Db, id: number) {
    return db.bloodRequest.findUnique({ where: { id }, select: REQUEST_SELECT });
  },

  /**
   * Locks the request row (not the requester's user row) in its own statement, so fulfill and
   * cancel run one at a time. The requester's department is read with it for the cancel scope.
   */
  async lock(db: Db, id: number): Promise<LockedRequest | null> {
    const rows = await db.$queryRaw<LockedRequest[]>`
      SELECT r.status, r.requester_id::text AS requester_id, r.required_by_date,
             u.department_id AS requester_department_id
        FROM blood_requests r JOIN users u ON u.id = r.requester_id
       WHERE r.id = ${id}
         FOR UPDATE OF r`;
    return rows[0] ?? null;
  },

  resolve(
    db: Db,
    id: number,
    data: { status: 'fulfilled' | 'cancelled'; fulfilledById?: string; resolvedAt: Date },
  ) {
    return db.bloodRequest.update({ where: { id }, data, select: REQUEST_SELECT });
  },

  list(db: Db, where: Prisma.BloodRequestWhereInput, skip: number, take: number) {
    return db.bloodRequest.findMany({
      where,
      select: REQUEST_SELECT,
      orderBy: [{ requiredByDate: 'asc' }, { id: 'asc' }],
      skip,
      take,
    });
  },

  count(db: Db, where: Prisma.BloodRequestWhereInput) {
    return db.bloodRequest.count({ where });
  },

  /** Expires every pending request whose last day is before `today` (FR-BLOOD-009). */
  expirePastDue(db: Db, today: Date, now: Date) {
    return db.$queryRaw<{ id: number; required_by_date: Date }[]>`
      UPDATE blood_requests
         SET status = 'expired', resolved_at = ${now}
       WHERE status = 'pending' AND required_by_date < ${today}::date
   RETURNING id, required_by_date`;
  },

  findRequesterContact(db: Db, userId: string) {
    return db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  },
};
