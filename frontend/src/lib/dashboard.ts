import {
  EVENT_STATUSES,
  ROLES,
  type EventStatus,
  type QueueHealth,
  type Role,
  type UserType,
} from '@uniconnect/shared';

// The role-adaptive overview (PRD FR-DASH-001–004; DECISIONS D13, D42, D43).

export type DashboardSection = 'personal' | 'moderator' | 'dept_admin' | 'super_admin';

/**
 * The overview's sections, top to bottom. The role view comes first; the personal view is for
 * every student and faculty account whatever its role (D13), so a moderator or dept admin keeps
 * it underneath. A super admin has no personal view (the endpoint is student and faculty only).
 */
export function dashboardSections(role: Role, userType: UserType): DashboardSection[] {
  const sections: DashboardSection[] = [];
  if (role === 'super_admin') return ['super_admin'];
  if (role === 'moderator') sections.push('moderator');
  if (role === 'dept_admin') sections.push('dept_admin');
  if (userType === 'student' || userType === 'faculty') sections.push('personal');
  return sections;
}

export const ROLE_PLURAL: Record<Role, string> = {
  student: 'Students',
  faculty: 'Faculty',
  moderator: 'Moderators',
  dept_admin: 'Dept admins',
  super_admin: 'Super admins',
};

export interface ChartRow {
  key: string;
  label: string;
  value: number;
}

/** Role counts as chart rows, always in role order with zeros kept (color follows entity). */
export function roleRows(counts: Record<Role, number>): ChartRow[] {
  return ROLES.map((role) => ({ key: role, label: ROLE_PLURAL[role], value: counts[role] ?? 0 }));
}

/** Departments as chart rows, largest first, ties by name. */
export function departmentRows(rows: { id: number; name: string; count: number }[]): ChartRow[] {
  return [...rows]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((d) => ({ key: String(d.id), label: d.name, value: d.count }));
}

export function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, n) => total + n, 0);
}

/** Event statuses in lifecycle order, with their counts. */
export function statusRows(counts: Record<EventStatus, number>): [EventStatus, number][] {
  return EVENT_STATUSES.map((s) => [s, counts[s] ?? 0]);
}

export type Tone = 'success' | 'warning' | 'destructive' | 'secondary';

/** A queue is fine, has failed jobs to look at, or could not be read. */
export function queueTone(q: QueueHealth): Tone {
  if (q.state === 'unavailable' || !q.counts) return 'warning';
  return q.counts.failed > 0 ? 'destructive' : 'success';
}

/** A term or membership end: warn inside the last 30 days, flag the last week. */
export function daysLeftTone(days: number | null): Tone {
  if (days === null) return 'secondary';
  if (days <= 7) return 'destructive';
  if (days <= 30) return 'warning';
  return 'success';
}
