import {
  AUDIT_ACTIONS,
  paginationMeta,
  type BloodRequest,
  type BloodRequestListQuery,
  type CreateBloodRequestInput,
  type Paginated,
} from '@uniconnect/shared';
import { env } from '../../config/env.js';
import { fromDbDate, toDbDate, todayInDhaka } from '../../lib/dates.js';
import { AppError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { isLockWait } from '../../lib/prisma-errors.js';
import { prisma } from '../../lib/prisma.js';
import { enqueueEmail } from '../../queues/email.queue.js';
import type { Db } from '../../repositories/audit.repository.js';
import { auditService } from '../../services/audit.service.js';
import { BLOOD_BUSY, canCancelWith, toBloodRequest, type BloodCaller } from './blood.mapper.js';
import { requestRepository as repo, whereRequests, type RequestRow } from './request.repository.js';

// FR-BLOOD-005–009 (DECISIONS D40).

const NOT_FOUND = () => new AppError(404, 'BLOOD_REQUEST_NOT_FOUND', 'Blood request not found.');
const NOT_PENDING = () =>
  new AppError(
    409,
    'BLOOD_REQUEST_NOT_PENDING',
    'This request is no longer open: it was fulfilled, cancelled or has expired.',
  );

const RESOLVE_TX = { maxWait: 15_000, timeout: 25_000 };

/** Locks the row, then checks it is still open (pending, and its last day not yet past). */
async function lockPending(tx: Db, id: number, today: string) {
  await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '15s'`);
  const locked = await repo.lock(tx, id);
  if (!locked) throw NOT_FOUND();
  return {
    locked,
    open: locked.status === 'pending' && fromDbDate(locked.required_by_date) >= today,
  };
}

async function withLockMapping<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isLockWait(err)) throw BLOOD_BUSY();
    throw err;
  }
}

export const requestService = {
  /** FR-BLOOD-005. Any signed-in user; no donor notification in V1 (PRD #15). */
  async create(caller: BloodCaller, input: CreateBloodRequestInput): Promise<BloodRequest> {
    if (input.required_by_date < todayInDhaka()) {
      throw new AppError(
        400,
        'REQUIRED_BY_DATE_PAST',
        'The required-by date must be today or later.',
      );
    }
    const row = await prisma.$transaction((tx) =>
      repo.create(tx, {
        requesterId: caller.id,
        patientName: input.patient_name,
        bloodGroup: input.blood_group,
        unitsNeeded: input.units_needed,
        reason: input.reason ?? null,
        contactPhone: input.contact_phone,
        hospitalName: input.hospital_name,
        requiredByDate: toDbDate(input.required_by_date),
      }),
    );
    return toBloodRequest(row, caller);
  },

  /** FR-BLOOD-006. Pending by default; soonest deadline first. */
  async list(caller: BloodCaller, q: BloodRequestListQuery): Promise<Paginated<BloodRequest>> {
    const where = whereRequests(q);
    const [rows, total] = await Promise.all([
      repo.list(prisma, where, (q.page - 1) * q.limit, q.limit),
      repo.count(prisma, where),
    ]);
    return {
      data: rows.map((r) => toBloodRequest(r, caller)),
      meta: paginationMeta(q.page, q.limit, total),
    };
  },

  /**
   * FR-BLOOD-007. The row lock makes concurrent fulfills run in turn: the first wins, the rest
   * see a resolved row and get 409. No BloodDonation is created. The requester gets one email.
   */
  async fulfill(caller: BloodCaller, id: number): Promise<BloodRequest> {
    const today = todayInDhaka();
    const row = await withLockMapping(() =>
      prisma.$transaction(async (tx) => {
        const { locked, open } = await lockPending(tx, id, today);
        if (locked.requester_id === caller.id) {
          throw new AppError(
            403,
            'CANNOT_FULFILL_OWN_REQUEST',
            "You can't fulfill your own request. Cancel it instead.",
          );
        }
        if (!open) throw NOT_PENDING();
        const updated = await repo.resolve(tx, id, {
          status: 'fulfilled',
          fulfilledById: caller.id,
          resolvedAt: new Date(),
        });
        await auditService.record(tx, {
          userId: caller.id,
          action: AUDIT_ACTIONS.BLOOD_REQUEST_FULFILLED,
          entityType: 'blood_request',
          entityId: id,
          oldValue: { status: locked.status },
          newValue: { status: 'fulfilled', fulfilled_by: caller.id },
          ipAddress: caller.ip,
        });
        return updated;
      }, RESOLVE_TX),
    );
    await notifyRequester(row);
    return toBloodRequest(row, caller);
  },

  /** FR-BLOOD-008. Requester, a dept_admin of the requester's department, or a super_admin. */
  async cancel(caller: BloodCaller, id: number): Promise<BloodRequest> {
    const today = todayInDhaka();
    const row = await withLockMapping(() =>
      prisma.$transaction(async (tx) => {
        const { locked, open } = await lockPending(tx, id, today);
        const allowed = canCancelWith(caller, {
          requesterId: locked.requester_id,
          requesterDepartmentId: locked.requester_department_id,
        });
        if (!allowed) {
          throw new AppError(
            403,
            'BLOOD_REQUEST_FORBIDDEN',
            'Only the requester, their department admin or a super admin can cancel this request.',
          );
        }
        if (!open) throw NOT_PENDING();
        const updated = await repo.resolve(tx, id, { status: 'cancelled', resolvedAt: new Date() });
        await auditService.record(tx, {
          userId: caller.id,
          action: AUDIT_ACTIONS.BLOOD_REQUEST_CANCELLED,
          entityType: 'blood_request',
          entityId: id,
          oldValue: { status: locked.status },
          newValue: { status: 'cancelled' },
          ipAddress: caller.ip,
        });
        return updated;
      }, RESOLVE_TX),
    );
    return toBloodRequest(row, caller);
  },

  /**
   * Daily job `expire-blood-requests` (FR-BLOOD-009), 00:05 Asia/Dhaka. "Today" is the Dhaka
   * date, not the database's UTC CURRENT_DATE. One audit row per request, actor = system.
   * Safe to run twice: a second run finds nothing pending past its date.
   */
  async expireRequests(now: Date = new Date()): Promise<number> {
    const today = toDbDate(todayInDhaka(now));
    return prisma.$transaction(async (tx) => {
      const rows = await repo.expirePastDue(tx, today, now);
      for (const r of rows) {
        await auditService.record(tx, {
          userId: null,
          action: AUDIT_ACTIONS.BLOOD_REQUEST_EXPIRED,
          entityType: 'blood_request',
          entityId: r.id,
          oldValue: { status: 'pending' },
          newValue: { status: 'expired', required_by_date: fromDbDate(r.required_by_date) },
        });
      }
      return rows.length;
    });
  },
};

/** After commit: a queue outage must not undo the fulfill. Name only, no contact details (D40). */
async function notifyRequester(row: RequestRow): Promise<void> {
  try {
    const to = await repo.findRequesterContact(prisma, row.requesterId);
    if (!to) return;
    await enqueueEmail(
      {
        kind: 'blood-request-fulfilled',
        to: to.email,
        name: to.name,
        patientName: row.patientName,
        bloodGroup: row.bloodGroup,
        hospitalName: row.hospitalName,
        fulfillerName: row.fulfiller?.name ?? 'A UniConnect user',
        url: `${env.FRONTEND_ORIGIN}/dashboard/blood`,
      },
      { jobId: `blood-fulfilled-${row.id}` },
    );
  } catch (err) {
    logger.error(`blood fulfilled email not queued: ${(err as Error).message}`);
  }
}
