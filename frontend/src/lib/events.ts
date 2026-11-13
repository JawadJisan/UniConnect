import type {
  EventRegistrationStatus,
  EventStatus,
  EventVisibility,
  Role,
} from '@uniconnect/shared';
import {
  BanIcon,
  CalendarCheckIcon,
  CircleCheckIcon,
  FilePenLineIcon,
  FlagIcon,
  TicketIcon,
  UserXIcon,
} from 'lucide-react';
import type { StatusMeta } from './membership';

/**
 * Display rules for events (DECISIONS D36). Display only: the API decides what is allowed, so
 * a button shown here can still be refused, and the screen shows the API's message when it is.
 */

export type { StatusMeta };

export const EVENT_STATUS_META: Record<EventStatus, StatusMeta> = {
  draft: { label: 'Draft', variant: 'secondary', Icon: FilePenLineIcon },
  published: { label: 'Published', variant: 'success', Icon: CalendarCheckIcon },
  cancelled: { label: 'Cancelled', variant: 'destructive', Icon: BanIcon },
  completed: { label: 'Completed', variant: 'default', Icon: FlagIcon },
};

export const REGISTRATION_STATUS_META: Record<EventRegistrationStatus, StatusMeta> = {
  registered: { label: 'Registered', variant: 'default', Icon: TicketIcon },
  attended: { label: 'Attended', variant: 'success', Icon: CircleCheckIcon },
  cancelled: { label: 'Cancelled', variant: 'destructive', Icon: BanIcon },
  no_show: { label: 'No show', variant: 'warning', Icon: UserXIcon },
};

export const VISIBILITY_LABEL: Record<EventVisibility, string> = {
  public: 'Public',
  members_only: 'Members only',
};

/** Why the caller can't register, in words (GET /events/:id `register_blocked_reason`). */
export const BLOCKED_REASON_TEXT = {
  not_open: 'Registration is closed: the event is not published, or it has ended.',
  full: 'This event is full. There is no waiting list.',
  not_eligible:
    "This event is for members of the listed departments' clubs. You need an active club membership, and your own department must be listed.",
  already_registered: 'You are registered for this event.',
  super_admin: "Super admins can't register for events.",
  no_show: 'You were marked as a no-show for this event, so your registration is closed.',
} as const;

/** Roles that may create and manage events (PRD #3). The API checks the club itself. */
export const ORGANIZER_ROLES: readonly Role[] = ['moderator', 'dept_admin', 'super_admin'];

export const canOrganize = (role: Role) => ORGANIZER_ROLES.includes(role);

// Asia/Dhaka is UTC+6 all year (no daylight saving), so a fixed offset is exact.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/**
 * An ISO instant as a `datetime-local` value in Dhaka time ("2026-11-20T14:00"). Event times
 * are entered and shown in the university's zone, never the browser's.
 */
export function dhakaInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 16);
}

/** A `datetime-local` value read as Dhaka time, as the ISO string with offset the API takes. */
export function fromDhakaInput(value: string): string {
  return `${value}:00+06:00`;
}

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Dhaka',
});
const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Dhaka',
});

/** "20 Nov 2026, 14:00–17:00", or "20 Nov 2026, 14:00 – 21 Nov 2026, 12:00" across days. */
export function formatEventWhen(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  const startDay = DAY.format(s);
  const endDay = DAY.format(e);
  if (startDay === endDay) return `${startDay}, ${TIME.format(s)}–${TIME.format(e)}`;
  return `${startDay}, ${TIME.format(s)} – ${endDay}, ${TIME.format(e)}`;
}

/** "9 Nov 2026, 14:05", for registration and check-in times. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${DAY.format(d)}, ${TIME.format(d)}`;
}

/** "12 / 40" with a cap, "12 registered" without one. */
export function seatsText(count: number, max: number | null): string {
  return max === null ? `${count} registered` : `${count} / ${max}`;
}

export const isFull = (count: number, max: number | null) => max !== null && count >= max;
