import { CircleCheckIcon, HistoryIcon, type LucideIcon } from 'lucide-react';
import { addDays, todayInDhaka } from './membership';

/**
 * Display rules for committee and dept admin terms (DECISIONS D34). Display only: the API
 * decides what is allowed, and the dialogs show its message when it refuses.
 */

export { addDays, todayInDhaka };

export type TermStatus = 'current' | 'ended';

export const TERM_STATUS_META: Record<
  TermStatus,
  { label: string; variant: 'success' | 'secondary'; Icon: LucideIcon }
> = {
  current: { label: 'Current', variant: 'success', Icon: CircleCheckIcon },
  ended: { label: 'Ended', variant: 'secondary', Icon: HistoryIcon },
};

/** The calendar year in Bangladesh, which committee terms are counted in. */
export function currentDhakaYear(now: Date = new Date()): number {
  return Number(todayInDhaka(now).slice(0, 4));
}

/** The same day a year later, clamped (29 Feb → 28 Feb). */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  const target = new Date(Date.UTC(y + years, m - 1, Math.min(d, lastDay)));
  return target.toISOString().slice(0, 10);
}

/** A one-year term starting on `start`: its last day is the day before the anniversary. */
export function oneYearTermEnd(start: string): string {
  return addDays(addYears(start, 1), -1);
}

/** Positions offered as suggestions; any other title is allowed (PRD FR-COMM-002). */
export const COMMITTEE_POSITIONS = [
  'President',
  'Vice President',
  'General Secretary',
  'Joint Secretary',
  'Treasurer',
  'Organizing Secretary',
  'Executive Member',
  'Advisor',
] as const;
