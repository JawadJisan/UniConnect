/**
 * Closed value sets from docs/DATABASE_SCHEMA_V1.md.
 * If a value changes here, the matching database CHECK constraint must change too.
 */

export const USER_TYPES = ['student', 'faculty', 'super_admin'] as const;
export const ROLES = ['student', 'faculty', 'moderator', 'dept_admin', 'super_admin'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export const MEMBERSHIP_TYPES = ['monthly', 'yearly'] as const;
export const MEMBERSHIP_STATUSES = ['pending', 'active', 'expired', 'cancelled'] as const;
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
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
