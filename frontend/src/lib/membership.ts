import type {
  MembershipStatus,
  MembershipSummary,
  MembershipType,
  PaymentStatus,
} from '@uniconnect/shared';
import {
  BanIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  HourglassIcon,
  TimerOffIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * Display rules for memberships. Display only: the API decides what is allowed (D32), so a
 * button shown here can still be refused, and the dialog shows the API's message when it is.
 */

export interface StatusMeta {
  /** Uppercase mono text, the meaning in words (never colour alone). */
  label: string;
  variant: 'success' | 'default' | 'warning' | 'secondary' | 'destructive';
  Icon: LucideIcon;
}

export const STATUS_META: Record<MembershipStatus, StatusMeta> = {
  active: { label: 'Active', variant: 'success', Icon: CircleCheckIcon },
  scheduled: { label: 'Scheduled', variant: 'default', Icon: CalendarClockIcon },
  pending: { label: 'Pending', variant: 'warning', Icon: HourglassIcon },
  expired: { label: 'Expired', variant: 'secondary', Icon: TimerOffIcon },
  cancelled: { label: 'Cancelled', variant: 'destructive', Icon: BanIcon },
};

export const PLAN_LABEL: Record<MembershipType, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: 'Awaiting payment',
  completed: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
};

/** The statuses a cancel applies to (PRD FR-MEM-003). */
export const CANCELLABLE: readonly MembershipStatus[] = ['pending', 'scheduled', 'active'];

/** The rows that matter for one club right now. `list` is newest first, as the API sends it. */
export interface MembershipState {
  active?: MembershipSummary;
  scheduled?: MembershipSummary;
  pending?: MembershipSummary;
  /** The newest row of any status, for "Your last membership expired on …". */
  latest?: MembershipSummary;
}

export function currentMembership(list: MembershipSummary[], clubId?: number): MembershipState {
  const rows = clubId === undefined ? list : list.filter((m) => m.club.id === clubId);
  return {
    active: rows.find((m) => m.status === 'active'),
    scheduled: rows.find((m) => m.status === 'scheduled'),
    pending: rows.find((m) => m.status === 'pending'),
    latest: rows[0],
  };
}

export interface MembershipActions {
  /** No open row: offer a new membership. */
  purchase: boolean;
  /** The active membership an early renewal would follow. */
  renewFrom?: MembershipSummary;
  /** The membership "Cancel membership" applies to. */
  cancel?: MembershipSummary;
  /** An unpaid checkout the student can close. */
  cancelCheckout?: MembershipSummary;
}

/**
 * The API allows one active row and one pending-or-scheduled row per club (ADR 0001), so:
 * renew only while active with nothing queued, and buy only when nothing is open.
 */
export function membershipActions(state: MembershipState): MembershipActions {
  const { active, scheduled, pending } = state;
  return {
    purchase: !active && !scheduled && !pending,
    renewFrom: active && !scheduled && !pending ? active : undefined,
    cancel: active ?? scheduled,
    cancelCheckout: pending,
  };
}

const DHAKA_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's `YYYY-MM-DD` in Bangladesh, the calendar membership dates use. */
export function todayInDhaka(now: Date = new Date()): string {
  return DHAKA_DATE.format(now);
}

const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `today` to the last day `end` (0 when it ends today, negative when past). */
export function daysLeft(end: string, today: string = todayInDhaka()): number {
  return Math.round((utc(end) - utc(today)) / DAY_MS);
}

/** `YYYY-MM-DD` plus `days`, date-only, no time-zone drift. */
export function addDays(date: string, days: number): string {
  return new Date(utc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** "12 days", "1 day", "Ends today", "Ended". */
export function formatDaysLeft(days: number): string {
  if (days < 0) return 'Ended';
  if (days === 0) return 'Ends today';
  return days === 1 ? '1 day' : `${days} days`;
}
