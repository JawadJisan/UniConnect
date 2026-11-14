import type { AuditLogEntry } from './audit.js';
import type { Announcement } from './announcement.js';
import type { BloodRequest } from './blood.js';
import type { CommitteeEntry } from './committee.js';
import type { EventStatus, Role } from './enums.js';
import type { EventSummary } from './event.js';
import type { MembershipSummary } from './membership.js';

// Dashboard responses (PRD FR-DASH-001–004; DECISIONS D13 resolved 2026-11-14, D42).
// None of them carries an email, a password or token, or a blood donor's contact details.

interface Ref {
  id: number;
  name: string;
}

interface PersonRef {
  id: string;
  name: string;
}

/**
 * GET /api/v1/dashboard/student: the personal view for every student and faculty account,
 * whatever their role (D13: a moderator or dept admin keeps it).
 */
export interface PersonalDashboard {
  upcoming_events: EventSummary[];
  /** Only for user_type student (PRD §5: faculty don't buy memberships); null otherwise. */
  membership: {
    current: MembershipSummary | null;
    /** A paid early renewal waiting to start (ADR 0001). */
    scheduled: MembershipSummary | null;
    /** Days until `current.end_date` (Asia/Dhaka), or null. */
    days_left: number | null;
  } | null;
  announcements: Announcement[];
  /** Pending requests for the caller's blood group, soonest first, not their own. */
  blood_requests: BloodRequest[];
  chatbot: { enabled: boolean };
}

/** GET /api/v1/dashboard/moderator: the club where the moderator holds a current seat. */
export interface ModeratorDashboard {
  club: Ref;
  stats: {
    upcoming_events: number;
    /** registered + attended across upcoming published events. */
    upcoming_registrations: number;
    /** Active memberships whose end_date is today or later (Asia/Dhaka). */
    active_members: number;
  };
  drafts: EventSummary[];
  /** Name and student ID only (D36: registrant lists never carry email or phone). */
  recent_registrations: {
    id: number;
    status: string;
    registered_at: string;
    user: PersonRef & { student_id: string | null };
    event: { id: number; title: string; start_date: string };
  }[];
  committee: CommitteeEntry[];
}

/** GET /api/v1/dashboard/dept-admin: every figure is the caller's department only. */
export interface DeptAdminDashboard {
  department: Ref;
  users_by_role: Record<Role, number>;
  /** Events of the department's club starting in the current Dhaka month. */
  events_this_month: { total: number; by_status: Record<EventStatus, number> };
  pending_blood_verifications: number;
  active_memberships: number;
  /** Department posts plus its club's posts, created this Dhaka month. */
  announcements_this_month: number;
  committee: { vacant: boolean; current: CommitteeEntry[] };
  admin_term: { id: number; start_date: string; end_date: string; days_left: number } | null;
}

export type HealthState = 'ok' | 'error';

export interface QueueHealth {
  name: string;
  /** `unavailable` when Redis didn't answer; the counts are then null. */
  state: 'ok' | 'unavailable';
  counts: { waiting: number; active: number; delayed: number; failed: number } | null;
}

/** GET /api/v1/dashboard/super-admin. */
export interface SuperAdminDashboard {
  users_by_role: Record<Role, number>;
  users_by_department: (Ref & { count: number })[];
  events_by_status: Record<EventStatus, number>;
  active_memberships: number;
  /** Sum of completed payment transactions, a 2-decimal BDT string (never a float). */
  revenue: { amount: string; currency: 'BDT' };
  fulfilled_blood_requests: number;
  recent_audit: AuditLogEntry[];
  dept_admin_terms: {
    id: number;
    start_date: string;
    end_date: string;
    user: PersonRef;
    department: Ref;
  }[];
  health: { db: HealthState; redis: HealthState; queues: QueueHealth[] };
}
