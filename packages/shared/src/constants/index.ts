/**
 * Closed value sets from docs/DATABASE_SCHEMA_V1.md.
 * If a value changes here, the matching database CHECK constraint must change too.
 */

export const USER_TYPES = ['student', 'faculty', 'super_admin'] as const;
export const ROLES = ['student', 'faculty', 'moderator', 'dept_admin', 'super_admin'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const MEMBERSHIP_TYPES = ['monthly', 'yearly'] as const;
/** `scheduled`: a paid renewal waiting for the previous membership to end (DECISIONS D11). */
export const MEMBERSHIP_STATUSES = [
  'pending',
  'scheduled',
  'active',
  'expired',
  'cancelled',
] as const;
export const PAYMENT_STATUSES = ['pending', 'completed', 'failed', 'refunded'] as const;

export const EVENT_VISIBILITIES = ['public', 'members_only'] as const;
export const EVENT_STATUSES = ['draft', 'published', 'cancelled', 'completed'] as const;
export const EVENT_REGISTRATION_STATUSES = [
  'registered',
  'attended',
  'cancelled',
  'no_show',
] as const;

export const BLOOD_REQUEST_STATUSES = ['pending', 'fulfilled', 'cancelled', 'expired'] as const;

/** `AuditLog.action` values. Add new actions here, not as string literals in services. */
export const AUDIT_ACTIONS = {
  USER_REGISTERED: 'USER_REGISTERED',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  LOGIN: 'LOGIN',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  /** Self-service edit of PATCH /api/v1/users/me (DECISIONS D24). */
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  AVATAR_UPDATED: 'AVATAR_UPDATED',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  /** A super_admin edited another user's profile through PATCH /admin/users/:id (D29). */
  USER_UPDATED_BY_ADMIN: 'USER_UPDATED_BY_ADMIN',
  /** Club details or fees changed through PATCH /api/v1/clubs/:id (PRD §16). */
  CLUB_UPDATED: 'CLUB_UPDATED',
  /** A new logo through PATCH /api/v1/clubs/:id/logo (DECISIONS D31). */
  CLUB_LOGO_UPDATED: 'CLUB_LOGO_UPDATED',
  /** A membership became `active` after a validated payment (PRD §20, FR-MEM-001). */
  MEMBERSHIP_PURCHASED: 'MEMBERSHIP_PURCHASED',
  /** A paid early renewal was queued as `scheduled` (DECISIONS D11). */
  MEMBERSHIP_SCHEDULED: 'MEMBERSHIP_SCHEDULED',
  /** The daily job started a `scheduled` renewal (actor = system). */
  MEMBERSHIP_ACTIVATED: 'MEMBERSHIP_ACTIVATED',
  /** The daily job expired an `active` membership past its end date (actor = system). */
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',
  MEMBERSHIP_CANCELLED: 'MEMBERSHIP_CANCELLED',
  /** An unpaid checkout older than 30 minutes was cancelled (actor = system or the new checkout). */
  CHECKOUT_EXPIRED: 'CHECKOUT_EXPIRED',
  /** The gateway's Order Validation API confirmed a payment (actor = system). */
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  /** Payment failed or validation did not match the stored transaction (actor = system). */
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  /** A ClubCommitteeMember row was inserted (PRD FR-COMM-002). */
  ASSIGN_COMMITTEE_MEMBER: 'ASSIGN_COMMITTEE_MEMBER',
  /** A committee row's position or years changed (PRD FR-COMM-004, DECISIONS D34). */
  COMMITTEE_MEMBER_UPDATED: 'COMMITTEE_MEMBER_UPDATED',
  /** A committee row's is_current became false (endpoint, or the daily job as system). */
  END_COMMITTEE_TERM: 'END_COMMITTEE_TERM',
  /** A DepartmentAdminTerm was inserted (PRD FR-ADMIN-001). */
  ASSIGN_DEPT_ADMIN: 'ASSIGN_DEPT_ADMIN',
  /** A dept admin term's is_current became false (endpoint, or the daily job as system). */
  END_DEPT_ADMIN_TERM: 'END_DEPT_ADMIN_TERM',
  /** A current term was replaced by a new one in one transaction (PRD FR-ADMIN-003). */
  RENEW_DEPT_ADMIN_TERM: 'RENEW_DEPT_ADMIN_TERM',
  /** A draft event was inserted (PRD FR-EVENT-001). */
  EVENT_CREATED: 'EVENT_CREATED',
  /** An event's fields or poster changed (FR-EVENT-002, FR-EVENT-004; DECISIONS D36). */
  EVENT_UPDATED: 'EVENT_UPDATED',
  /** status draft → published (FR-EVENT-003). */
  EVENT_PUBLISHED: 'EVENT_PUBLISHED',
  /** status → cancelled (FR-EVENT-005). */
  EVENT_CANCELLED: 'EVENT_CANCELLED',
  /** status published → completed; remaining registrations became no_show (FR-EVENT-012). */
  EVENT_COMPLETED: 'EVENT_COMPLETED',
  /** An organizer checked a registrant in (FR-EVENT-010). */
  EVENT_CHECK_IN: 'EVENT_CHECK_IN',
  /** An announcement was posted (PRD FR-ANNOUNCE-001; DECISIONS D38). */
  ANNOUNCEMENT_CREATED: 'ANNOUNCEMENT_CREATED',
  /** Its title or content changed (FR-ANNOUNCE-003); changed fields only. */
  ANNOUNCEMENT_UPDATED: 'ANNOUNCEMENT_UPDATED',
  /** It was deleted; `old_value` keeps a snapshot (FR-ANNOUNCE-003). */
  ANNOUNCEMENT_DELETED: 'ANNOUNCEMENT_DELETED',
  /** is_pinned false → true (FR-ANNOUNCE-004). */
  ANNOUNCEMENT_PINNED: 'ANNOUNCEMENT_PINNED',
  /** is_pinned true → false (FR-ANNOUNCE-004). */
  ANNOUNCEMENT_UNPINNED: 'ANNOUNCEMENT_UNPINNED',
  /** A dept_admin or super_admin verified a donation; `last_donation_date` synced (FR-BLOOD-002). */
  BLOOD_DONATION_VERIFIED: 'BLOOD_DONATION_VERIFIED',
  /** A blood request was marked fulfilled by another user (FR-BLOOD-007; DECISIONS D40). */
  BLOOD_REQUEST_FULFILLED: 'BLOOD_REQUEST_FULFILLED',
  /** The requester, their dept_admin or a super_admin cancelled a request (FR-BLOOD-008). */
  BLOOD_REQUEST_CANCELLED: 'BLOOD_REQUEST_CANCELLED',
  /** The daily job expired a pending request past `required_by_date` (FR-BLOOD-009; system). */
  BLOOD_REQUEST_EXPIRED: 'BLOOD_REQUEST_EXPIRED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
