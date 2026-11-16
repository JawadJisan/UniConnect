import type { MembershipType } from '@uniconnect/shared';

/**
 * Date-only helpers for DATE columns. Values are `YYYY-MM-DD` strings; Prisma reads and writes
 * DATE as a JS Date at UTC midnight, so all arithmetic here is in UTC and never shifts a day.
 */
export type IsoDate = string;

const DHAKA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Bangladesh, where every club is. */
export function todayInDhaka(now: Date = new Date()): IsoDate {
  return DHAKA.format(now);
}

export const toDbDate = (d: IsoDate): Date => new Date(`${d}T00:00:00.000Z`);
export const fromDbDate = (d: Date): IsoDate => d.toISOString().slice(0, 10);

export function addDays(d: IsoDate, days: number): IsoDate {
  const date = toDbDate(d);
  date.setUTCDate(date.getUTCDate() + days);
  return fromDbDate(date);
}

/** Calendar months, clamped to the target month's last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(d: IsoDate, months: number): IsoDate {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromDbDate(target);
}

/**
 * The last day of a membership that starts on `start`. The end date is inclusive, so the next
 * period starts on `end + 1 day` with no gap and no overlap (DECISIONS D32).
 */
export function membershipEnd(start: IsoDate, type: MembershipType): IsoDate {
  return addDays(addMonths(start, type === 'yearly' ? 12 : 1), -1);
}
