import { AUDIT_ACTIONS, type MembershipType, type PaymentIpnInput } from '@uniconnect/shared';
import { env } from '../../config/env.js';
import { Prisma } from '../../generated/prisma/client.js';
import { todayInDhaka } from '../../lib/dates.js';
import { AppError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { paymentGateway, type OrderValidation } from '../../lib/payments/index.js';
import { prisma } from '../../lib/prisma.js';
import { enqueueEmail } from '../../queues/email.queue.js';
import { auditService } from '../../services/audit.service.js';
import { membershipRepository } from '../memberships/membership.repository.js';
import { activatePaid, type Activation } from '../memberships/membership.state.js';
import { paymentRepository } from './payment.repository.js';

/** What an IPN did. Logged only; the gateway always gets the same answer. */
export type IpnOutcome =
  | 'completed'
  | 'failed'
  | 'duplicate'
  | 'unknown_transaction'
  | 'ignored'
  /** Paid, but the membership was cancelled first (D32): refund by hand. */
  | 'completed_after_cancel';

/** The validated amount equals the stored one ("500" and "500.00" are equal). */
function sameAmount(validated: string, stored: Prisma.Decimal): boolean {
  try {
    return new Prisma.Decimal(validated).equals(stored);
  } catch {
    return false;
  }
}

/** Why a validation answer is refused, or null when it confirms the payment. */
function rejection(v: OrderValidation, stored: { amount: Prisma.Decimal; currency: string }) {
  if (v.status !== 'VALID' && v.status !== 'VALIDATED')
    return `validation_${v.status.toLowerCase()}`;
  if (!sameAmount(v.amount, stored.amount)) return 'amount_mismatch';
  if (v.currency !== stored.currency) return 'currency_mismatch';
  return null;
}

export const paymentService = {
  /**
   * POST /memberships/payment/ipn (PRD FR-MEM-001). The IPN body is never trusted: only its
   * `tran_id` and `val_id` are read, and the payment is settled from the gateway's Order
   * Validation answer. Idempotent: every write is guarded by `payment_status = 'pending'`.
   */
  async handleIpn(input: PaymentIpnInput): Promise<IpnOutcome> {
    const payment = await paymentRepository.findByTransactionId(prisma, input.tran_id);
    if (!payment) {
      logger.warn('payment IPN for an unknown tran_id; ignored');
      return 'unknown_transaction';
    }
    if (payment.paymentStatus !== 'pending') return 'duplicate';
    // A failure or cancel notice has no val_id and can't be verified, so it changes nothing;
    // the stale-checkout job closes the row after 30 minutes.
    if (!input.val_id) return 'ignored';

    let validation: OrderValidation;
    try {
      validation = await paymentGateway.validateOrder(input.val_id);
    } catch (err) {
      logger.error(`payment validation failed: ${(err as Error).message}`);
      // Not 200, so the gateway retries. The row stays pending.
      throw new AppError(502, 'PAYMENT_GATEWAY_ERROR', 'Could not validate the payment.');
    }

    // A val_id that belongs to another transaction (or none) proves nothing about this one.
    // Ignoring it, rather than failing the payment, means a forged IPN can't cancel someone's
    // checkout (D32).
    if (validation.tranId !== payment.transactionId) {
      logger.warn(`payment IPN val_id does not match tran_id ${payment.transactionId}; ignored`);
      return 'ignored';
    }

    const reason = rejection(validation, payment);
    const gatewayResponse = validation.raw as Prisma.InputJsonValue;
    const membershipId = payment.clubMembershipId;
    const today = todayInDhaka();

    const result = await prisma.$transaction(
      async (tx): Promise<{ outcome: IpnOutcome; activation?: Activation; type?: string }> => {
        // Membership row before payment row, the same order as cancel and the jobs.
        await membershipRepository.lock(tx, membershipId);
        const m = await membershipRepository.findById(tx, membershipId);
        if (!m) throw new Error(`payment ${payment.id} has no membership`);

        if (reason) {
          const n = await paymentRepository.settle(tx, payment.transactionId, {
            paymentStatus: 'failed',
            valId: input.val_id,
            gatewayResponse,
          });
          if (n === 0) return { outcome: 'duplicate' };
          if (m.status === 'pending') {
            await membershipRepository.update(tx, membershipId, { status: 'cancelled' });
          }
          await auditService.record(tx, {
            userId: null,
            action: AUDIT_ACTIONS.PAYMENT_FAILED,
            entityType: 'payment_transaction',
            entityId: payment.id,
            oldValue: { payment_status: 'pending', membership_status: m.status },
            newValue: {
              payment_status: 'failed',
              membership_status: m.status === 'pending' ? 'cancelled' : m.status,
              reason,
              validation_status: validation.status,
            },
          });
          return { outcome: 'failed' };
        }

        const n = await paymentRepository.settle(tx, payment.transactionId, {
          paymentStatus: 'completed',
          valId: input.val_id,
          bankTranId: validation.bankTranId,
          paymentMethod: validation.method,
          validatedAt: new Date(),
          gatewayResponse,
        });
        if (n === 0) return { outcome: 'duplicate' };

        const orphaned = m.status !== 'pending';
        await auditService.record(tx, {
          userId: null,
          action: AUDIT_ACTIONS.PAYMENT_COMPLETED,
          entityType: 'payment_transaction',
          entityId: payment.id,
          oldValue: { payment_status: 'pending' },
          newValue: {
            payment_status: 'completed',
            transaction_id: payment.transactionId,
            amount: payment.amount.toFixed(2),
            currency: payment.currency,
            membership_id: membershipId,
            ...(orphaned && { note: 'membership_cancelled_before_payment' }),
          },
        });
        if (orphaned) return { outcome: 'completed_after_cancel' };

        const activation = await activatePaid(tx, m, today);
        return { outcome: 'completed', activation, type: m.type };
      },
    );

    if (result.outcome === 'completed_after_cancel') {
      logger.warn(
        `payment ${payment.transactionId} completed after its membership was cancelled; refund by hand`,
      );
    }
    if (result.outcome === 'completed' && result.activation) {
      // After commit. A queue outage must not undo a confirmed payment.
      try {
        await enqueueEmail({
          kind: 'membership-receipt',
          to: payment.user.email,
          name: payment.user.name,
          clubName: payment.membership.club.name,
          type: result.type as MembershipType,
          status: result.activation.status,
          startDate: result.activation.start,
          endDate: result.activation.end,
          amount: payment.amount.toFixed(2),
          currency: payment.currency,
          transactionId: payment.transactionId,
          url: `${env.FRONTEND_ORIGIN}/dashboard/memberships`,
        });
      } catch (err) {
        logger.error(`membership receipt not queued: ${(err as Error).message}`);
      }
    }
    return result.outcome;
  },
};
