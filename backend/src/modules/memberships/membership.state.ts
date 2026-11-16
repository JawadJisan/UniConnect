import { AUDIT_ACTIONS, type AuditAction, type MembershipType } from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { addDays, fromDbDate, membershipEnd, type IsoDate } from '../../lib/dates.js';
import type { Db } from '../../repositories/audit.repository.js';
import { auditService } from '../../services/audit.service.js';
import { paymentRepository } from '../payments/payment.repository.js';
import { membershipRepository } from './membership.repository.js';

/**
 * Membership state changes shared by the membership service (cancel, checkout, jobs) and the
 * payment service (IPN). Each runs inside the caller's transaction and writes its own audit row.
 */

export interface Activation {
  status: 'active' | 'scheduled';
  start: IsoDate;
  end: IsoDate;
}

/**
 * Turns a paid, locked `pending` membership into `active` from today, or into `scheduled` when
 * the pair still has an active row that ends today or later: the renewal then starts the day
 * after it (PRD FR-MEM-002, DECISIONS D11). An active row already past its end date (the daily
 * job hasn't run yet) is expired here first, so the one-active index never blocks a payment.
 */
export async function activatePaid(
  tx: Db,
  m: { id: number; userId: string; clubId: number; type: string },
  today: IsoDate,
): Promise<Activation> {
  const type = m.type as MembershipType;
  const sibling = await membershipRepository.findActiveSibling(tx, m.userId, m.clubId, m.id);

  if (sibling && fromDbDate(sibling.endDate) >= today) {
    const start = addDays(fromDbDate(sibling.endDate), 1);
    const end = membershipEnd(start, type);
    await membershipRepository.update(tx, m.id, { status: 'scheduled', start, end });
    await auditService.record(tx, {
      userId: null,
      action: AUDIT_ACTIONS.MEMBERSHIP_SCHEDULED,
      entityType: 'club_membership',
      entityId: m.id,
      oldValue: { status: 'pending' },
      newValue: { status: 'scheduled', start_date: start, end_date: end, after: sibling.id },
    });
    return { status: 'scheduled', start, end };
  }

  if (sibling) await expire(tx, [sibling.id]);

  const end = membershipEnd(today, type);
  await membershipRepository.update(tx, m.id, { status: 'active', start: today, end });
  await auditService.record(tx, {
    userId: null,
    action: AUDIT_ACTIONS.MEMBERSHIP_PURCHASED,
    entityType: 'club_membership',
    entityId: m.id,
    oldValue: { status: 'pending' },
    newValue: { status: 'active', start_date: today, end_date: end },
  });
  return { status: 'active', start: today, end };
}

/** Marks active rows expired (the daily job, or activatePaid catching up). Rows must be locked. */
export async function expire(tx: Db, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await membershipRepository.setStatusMany(tx, ids, 'expired');
  for (const id of ids) {
    await auditService.record(tx, {
      userId: null,
      action: AUDIT_ACTIONS.MEMBERSHIP_EXPIRED,
      entityType: 'club_membership',
      entityId: id,
      oldValue: { status: 'active' },
      newValue: { status: 'expired' },
    });
  }
}

/**
 * Cancels a locked `pending` membership and fails its pending payment. Used when a payment fails
 * validation, the gateway can't open a session, or a checkout goes stale.
 */
export async function cancelPending(
  tx: Db,
  membershipId: number,
  opts: {
    action: AuditAction;
    actorId: string | null;
    reason: string;
    ip?: string | null;
    extra?: Record<string, Prisma.InputJsonValue>;
  },
): Promise<void> {
  await membershipRepository.update(tx, membershipId, { status: 'cancelled' });
  await paymentRepository.failPendingFor(tx, [membershipId]);
  await auditService.record(tx, {
    userId: opts.actorId,
    action: opts.action,
    entityType: 'club_membership',
    entityId: membershipId,
    oldValue: { status: 'pending' },
    newValue: { status: 'cancelled', reason: opts.reason, ...opts.extra },
    ipAddress: opts.ip ?? null,
  });
}
