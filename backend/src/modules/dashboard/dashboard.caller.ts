import type { Request } from 'express';
import { unauthorized } from '../../lib/http-error.js';

/** Who is looking at a dashboard. Every module's caller type is a subset of this. */
export interface DashboardCaller {
  id: string;
  role: string;
  userType: string;
  departmentId: number | null;
  bloodGroup: string | null;
  name: string;
  email: string;
  phone: string | null;
  ip: string | null;
}

// requireAuth runs before every dashboard route; fail closed if it somehow didn't.
export function callerOf(req: Request): DashboardCaller {
  const user = req.auth?.user;
  if (!user) throw unauthorized();
  return {
    id: user.id,
    role: String(user.role),
    userType: String(user.userType),
    departmentId: (user.departmentId as number | null | undefined) ?? null,
    bloodGroup: (user.bloodGroup as string | null | undefined) ?? null,
    name: user.name,
    email: user.email,
    phone: (user.phone as string | null | undefined) ?? null,
    ip: req.ip ?? null,
  };
}

/** Whole days from `today` to `end` (both `YYYY-MM-DD`); 0 on the last day. */
export function daysBetween(today: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** The Dhaka calendar month containing `today`, as [start, next start) instants. */
export function dhakaMonth(today: string): { from: Date; to: Date } {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return {
    from: new Date(`${today.slice(0, 8)}01T00:00:00+06:00`),
    to: new Date(`${next}T00:00:00+06:00`),
  };
}

/** Group-by rows → a full record with zeros for keys that had no rows. */
export function countsBy<K extends string>(
  keys: readonly K[],
  rows: { key: string | null; count: number }[],
): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const r of rows) if (r.key !== null && r.key in out) out[r.key as K] += r.count;
  return out;
}
