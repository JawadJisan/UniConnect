import { randomUUID } from 'node:crypto';
import {
  AUDIT_ACTIONS,
  paginationMeta,
  type AdminMembershipListQuery,
  type AdminMembershipRow,
  type CheckoutResult,
  type MembershipStatus,
  type MembershipSummary,
  type MembershipType,
  type MyMembershipsQuery,
  type Paginated,
} from '@uniconnect/shared';
import { env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { addDays, fromDbDate, membershipEnd, todayInDhaka, type IsoDate } from '../../lib/dates.js';
import { AppError, conflict, forbidden } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { paymentGateway } from '../../lib/payments/index.js';
import { prisma } from '../../lib/prisma.js';
import type { Db } from '../../repositories/audit.repository.js';
import { roleRepository } from '../../repositories/role.repository.js';
import { auditService } from '../../services/audit.service.js';
import { paymentRepository } from '../payments/payment.repository.js';
import { toAdminMembership, toMembership } from './membership.mapper.js';
import { membershipRepository } from './membership.repository.js';
import { cancelPending, expire } from './membership.state.js';

/** Who is acting: the signed-in user, from req.auth. */
export interface MembershipCaller {
  id: string;
  role: string;
  userType: string;
  departmentId: number | null;
  name: string;
  email: string;
  phone: string | null;
  ip: string | null;
}

/** An unpaid checkout older than this is abandoned (PRD FR-MEM-001 step 3, §15 jobs). */
export const STALE_CHECKOUT_MS = 30 * 60 * 1000;
const JOB_BATCH = 200;

const MEMBERSHIP_NOT_FOUND = () =>
  new AppError(404, 'MEMBERSHIP_NOT_FOUND', 'Membership not found.');
const CLUB_NOT_FOUND = () => new AppError(404, 'CLUB_NOT_FOUND', 'Club not found.');
const CHECKOUT_IN_PROGRESS = () =>
  conflict(
    'CHECKOUT_IN_PROGRESS',
    'You already have a checkout in progress for this club. Finish it or try again in 30 minutes.',
  );

const CANCELLABLE: readonly MembershipStatus[] = ['pending', 'scheduled', 'active'];

/** `UC-20261111-3F2A9C1B7D4E`: our `tran_id`. Unguessable, and safe in a URL. */
function newTransactionId(today: IsoDate): string {
  const random = randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
  return `UC-${today.replaceAll('-', '')}-${random}`;
}

/** The fee for `type` as "500.00", or null when it isn't set or is zero. */
function feeFor(
  club: { membershipFeeMonthly: Prisma.Decimal | null; membershipFeeYearly: Prisma.Decimal | null },
  type: MembershipType,
): string | null {
  const fee = type === 'yearly' ? club.membershipFeeYearly : club.membershipFeeMonthly;
  if (fee === null || fee.lte(0)) return null;
  return fee.toFixed(2);
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

async function loadSummary(db: Db, id: number): Promise<MembershipSummary> {
  const row = await membershipRepository.findById(db, id);
  if (!row) throw MEMBERSHIP_NOT_FOUND();
  return toMembership(row);
}

type CheckoutRequest =
  | { kind: 'purchase'; clubId: number; type: MembershipType }
  | { kind: 'renew'; membershipId: number; type?: MembershipType };

interface OpenedCheckout {
  membershipId: number;
  transactionId: string;
  amount: string;
  clubName: string;
  type: MembershipType;
}

/**
 * FR-MEM-001 and 002, up to the gateway call. One transaction, serialized per student by the
 * user-row lock; the partial unique indexes are the backstop (DECISIONS D11).
 */
async function openCheckout(
  caller: MembershipCaller,
  req: CheckoutRequest,
): Promise<OpenedCheckout> {
  const today = todayInDhaka();
  try {
    return await prisma.$transaction(async (tx) => {
      await roleRepository.lockUser(tx, caller.id);

      let clubId: number;
      let type: MembershipType;
      let start = today;
      let renewing: number | null = null;

      if (req.kind === 'renew') {
        const old = await membershipRepository.findById(tx, req.membershipId);
        // Someone else's membership is not revealed.
        if (!old || old.userId !== caller.id) throw MEMBERSHIP_NOT_FOUND();
        if (old.status !== 'active' && old.status !== 'expired') {
          throw conflict(
            'MEMBERSHIP_NOT_RENEWABLE',
            'Only an active or expired membership can be renewed. Buy a new membership instead.',
          );
        }
        clubId = old.clubId;
        type = req.type ?? (old.type as MembershipType);
        renewing = old.id;
        // Provisional: the IPN sets the final dates when the payment is confirmed.
        if (old.status === 'active') {
          const next = addDays(fromDbDate(old.endDate), 1);
          if (next > today) start = next;
        }
      } else {
        clubId = req.clubId;
        type = req.type;
      }

      const club = await membershipRepository.findClubForCheckout(tx, clubId);
      if (!club) throw CLUB_NOT_FOUND();
      // V1: a student joins only their own department's club (PRD FR-MEM-001 step 2, #6).
      if (club.departmentId !== caller.departmentId) {
        throw forbidden("You can only join your own department's club.");
      }
      const amount = feeFor(club, type);
      if (!amount) {
        throw conflict('MEMBERSHIP_FEE_NOT_SET', `This club has no ${type} membership fee yet.`);
      }

      for (const row of await membershipRepository.findOpenForPair(tx, caller.id, clubId)) {
        if (row.status === 'scheduled') {
          throw conflict(
            'RENEWAL_ALREADY_SCHEDULED',
            'A paid renewal for this club is already scheduled.',
          );
        }
        if (row.status === 'active' && row.id !== renewing) {
          throw conflict(
            'MEMBERSHIP_ALREADY_ACTIVE',
            'You already have an active membership in this club. Renew it instead.',
          );
        }
        if (row.status === 'pending') {
          if (Date.now() - row.createdAt.getTime() < STALE_CHECKOUT_MS)
            throw CHECKOUT_IN_PROGRESS();
          // Abandoned: replace it. The stale-checkout job may have got there first.
          if (await membershipRepository.lockPending(tx, row.id)) {
            await cancelPending(tx, row.id, {
              action: AUDIT_ACTIONS.CHECKOUT_EXPIRED,
              actorId: caller.id,
              reason: 'replaced_by_new_checkout',
              ip: caller.ip,
            });
          }
        }
      }

      const end = membershipEnd(start, type);
      const membership = await membershipRepository.create(tx, {
        userId: caller.id,
        clubId,
        type,
        start,
        end,
      });
      const transactionId = newTransactionId(today);
      await paymentRepository.create(tx, {
        userId: caller.id,
        membershipId: membership.id,
        amount,
        transactionId,
      });
      return { membershipId: membership.id, transactionId, amount, clubName: club.name, type };
    });
  } catch (err) {
    // one_open_membership_per_user_club: a concurrent checkout won the race.
    if (isUniqueViolation(err)) throw CHECKOUT_IN_PROGRESS();
    throw err;
  }
}

/** Opens the gateway session. On failure the checkout is cancelled so the student can retry. */
async function startPayment(
  caller: MembershipCaller,
  opened: OpenedCheckout,
): Promise<CheckoutResult> {
  const front = env.FRONTEND_ORIGIN;
  let redirectUrl: string;
  try {
    ({ redirectUrl } = await paymentGateway.initSession({
      tranId: opened.transactionId,
      amount: opened.amount,
      currency: 'BDT',
      productName: `${opened.clubName} ${opened.type} membership`,
      customer: { name: caller.name, email: caller.email, phone: caller.phone },
      urls: {
        // Display only: these pages never grant membership (PRD FR-MEM-001).
        success: `${front}/dashboard/memberships?checkout=success`,
        fail: `${front}/dashboard/memberships?checkout=failed`,
        cancel: `${front}/dashboard/memberships?checkout=cancelled`,
        ipn: `${front}/api/v1/memberships/payment/ipn`,
      },
    }));
  } catch (err) {
    logger.error(`payment gateway session failed: ${(err as Error).message}`);
    await prisma.$transaction(async (tx) => {
      if (await membershipRepository.lockPending(tx, opened.membershipId)) {
        await cancelPending(tx, opened.membershipId, {
          action: AUDIT_ACTIONS.PAYMENT_FAILED,
          actorId: null,
          reason: 'gateway_session_failed',
        });
      }
    });
    throw new AppError(
      502,
      'PAYMENT_GATEWAY_ERROR',
      'The payment gateway is unavailable. Try again in a few minutes.',
    );
  }
  return {
    membership: await loadSummary(prisma, opened.membershipId),
    transaction_id: opened.transactionId,
    redirect_url: redirectUrl,
  };
}

/** Owner (a student), the club's dept_admin, or super_admin (PRD FR-MEM-003). */
function canCancel(
  caller: MembershipCaller,
  m: { userId: string; club: { departmentId: number } },
) {
  if (caller.role === 'super_admin') return true;
  if (caller.role === 'dept_admin' && caller.departmentId === m.club.departmentId) return true;
  return caller.userType === 'student' && caller.id === m.userId;
}

export const membershipService = {
  /** FR-MEM-001. */
  async purchase(
    caller: MembershipCaller,
    input: { club_id: number; type: MembershipType },
  ): Promise<CheckoutResult> {
    const opened = await openCheckout(caller, {
      kind: 'purchase',
      clubId: input.club_id,
      type: input.type,
    });
    return startPayment(caller, opened);
  },

  /** FR-MEM-002. A new row; the old one is never changed here. */
  async renew(
    caller: MembershipCaller,
    id: number,
    input: { type?: MembershipType },
  ): Promise<CheckoutResult> {
    const opened = await openCheckout(caller, {
      kind: 'renew',
      membershipId: id,
      type: input.type,
    });
    return startPayment(caller, opened);
  },

  /** FR-MEM-003. No refund in V1 (PRD #8). */
  async cancel(caller: MembershipCaller, id: number): Promise<MembershipSummary> {
    await prisma.$transaction(async (tx) => {
      if (!(await membershipRepository.lock(tx, id))) throw MEMBERSHIP_NOT_FOUND();
      const m = await membershipRepository.findById(tx, id);
      // Anyone who may not cancel it gets 404: a membership is private.
      if (!m || !canCancel(caller, m)) throw MEMBERSHIP_NOT_FOUND();
      if (!CANCELLABLE.includes(m.status as MembershipStatus)) {
        throw conflict('MEMBERSHIP_NOT_CANCELLABLE', `This membership is already ${m.status}.`);
      }

      await membershipRepository.update(tx, id, { status: 'cancelled' });
      if (m.status === 'pending') await paymentRepository.failPendingFor(tx, [id]);
      await auditService.record(tx, {
        userId: caller.id,
        action: AUDIT_ACTIONS.MEMBERSHIP_CANCELLED,
        entityType: 'club_membership',
        entityId: id,
        oldValue: { status: m.status },
        newValue: {
          status: 'cancelled',
          cancelled_by: caller.id === m.userId ? 'owner' : caller.role,
        },
        ipAddress: caller.ip,
      });
    });
    return loadSummary(prisma, id);
  },

  /** FR-MEM-004. Every status, newest first. */
  async listMine(
    caller: MembershipCaller,
    q: MyMembershipsQuery,
  ): Promise<Paginated<MembershipSummary>> {
    const { rows, total } = await membershipRepository.list(
      prisma,
      { userId: caller.id },
      q.page,
      q.limit,
    );
    return { data: rows.map(toMembership), meta: paginationMeta(q.page, q.limit, total) };
  },

  /** FR-MEM-005. A dept_admin sees only their department's club (tenant isolation). */
  async adminList(
    caller: MembershipCaller,
    q: AdminMembershipListQuery,
  ): Promise<Paginated<AdminMembershipRow>> {
    let departmentId: number | undefined;
    if (caller.role !== 'super_admin') {
      // requireRole let only dept_admin through; a dept_admin always has a department.
      if (caller.departmentId === null) throw forbidden();
      departmentId = caller.departmentId;
    }
    const { rows, total } = await membershipRepository.adminList(
      prisma,
      { departmentId, clubId: q.club_id, status: q.status, type: q.type },
      q.page,
      q.limit,
    );
    return { data: rows.map(toAdminMembership), meta: paginationMeta(q.page, q.limit, total) };
  },

  /**
   * Daily job `expire-memberships`: active rows past their last day become `expired`, then
   * scheduled renewals that are due and have no active row left become `active`.
   */
  async expireAndActivate(now: Date = new Date()): Promise<{ expired: number; activated: number }> {
    const today = todayInDhaka(now);
    let expired = 0;
    for (;;) {
      const n = await prisma.$transaction(async (tx) => {
        const rows = await membershipRepository.lockExpired(tx, today, JOB_BATCH);
        await expire(
          tx,
          rows.map((r) => r.id),
        );
        return rows.length;
      });
      expired += n;
      if (n < JOB_BATCH) break;
    }

    let activated = 0;
    for (;;) {
      const n = await prisma.$transaction(async (tx) => {
        const rows = await membershipRepository.lockDueScheduled(tx, today, JOB_BATCH);
        for (const { id } of rows) {
          await membershipRepository.update(tx, id, { status: 'active' });
          await auditService.record(tx, {
            userId: null,
            action: AUDIT_ACTIONS.MEMBERSHIP_ACTIVATED,
            entityType: 'club_membership',
            entityId: id,
            oldValue: { status: 'scheduled' },
            newValue: { status: 'active' },
          });
        }
        return rows.length;
      });
      activated += n;
      if (n < JOB_BATCH) break;
    }
    return { expired, activated };
  },

  /** Job `cancel-stale-pending`, every 15 minutes: abandoned checkouts are cancelled. */
  async cancelStale(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_CHECKOUT_MS);
    let cancelled = 0;
    for (;;) {
      const n = await prisma.$transaction(async (tx) => {
        const rows = await membershipRepository.lockStalePending(tx, cutoff, JOB_BATCH);
        for (const { id } of rows) {
          await cancelPending(tx, id, {
            action: AUDIT_ACTIONS.CHECKOUT_EXPIRED,
            actorId: null,
            reason: 'stale_checkout',
          });
        }
        return rows.length;
      });
      cancelled += n;
      if (n < JOB_BATCH) break;
    }
    return cancelled;
  },
};
