import type {
  AdminMembershipRow,
  MembershipStatus,
  MembershipSummary,
  MembershipType,
  PaymentStatus,
} from '@uniconnect/shared';
import { fromDbDate } from '../../lib/dates.js';
import type { AdminMembershipDbRow, MembershipRow } from './membership.repository.js';

/** Money stays a Decimal until it becomes a "500.00" string (CLAUDE.md, Money). */
export function toMembership(row: MembershipRow): MembershipSummary {
  const payment = row.payments[0];
  return {
    id: row.id,
    type: row.type as MembershipType,
    status: row.status as MembershipStatus,
    start_date: fromDbDate(row.startDate),
    end_date: fromDbDate(row.endDate),
    created_at: row.createdAt.toISOString(),
    club: {
      id: row.club.id,
      name: row.club.name,
      logo_url: row.club.logoUrl,
      department: row.club.department,
    },
    payment: payment
      ? {
          transaction_id: payment.transactionId,
          amount: payment.amount.toFixed(2),
          currency: payment.currency,
          status: payment.paymentStatus as PaymentStatus,
          validated_at: payment.validatedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export function toAdminMembership(row: AdminMembershipDbRow): AdminMembershipRow {
  return {
    ...toMembership(row),
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      student_id: row.user.studentId,
    },
  };
}
