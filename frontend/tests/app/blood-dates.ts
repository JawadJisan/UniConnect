import { todayInDhaka } from '@/lib/blood';

/** Dhaka's today plus `days`, as `YYYY-MM-DD` (the date inputs' format). */
export function addDaysIso(days: number): string {
  const d = new Date(`${todayInDhaka()}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
