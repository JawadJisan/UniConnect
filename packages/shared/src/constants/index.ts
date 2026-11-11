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
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
