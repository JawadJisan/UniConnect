import type { Announcement, Role } from '@uniconnect/shared';

// Announcement rules the UI needs before the API answers (PRD FR-ANNOUNCE; DECISIONS D38).
// The API stays the authority: these only decide which controls to offer.

export interface ScopeRef {
  id: number;
  name: string;
}

/** Where the caller may post. Exactly one of the two is chosen per announcement (D38). */
export interface ScopeOptions {
  departments: ScopeRef[];
  clubs: ScopeRef[];
}

/** Roles that post (FR-ANNOUNCE-001); the API checks the club or department itself. */
export function canPost(role: Role): boolean {
  return role === 'moderator' || role === 'dept_admin' || role === 'super_admin';
}

/** Roles that pin, on create and through the pin toggle (FR-ANNOUNCE-004, D38). */
export function canPinRole(role: Role): boolean {
  return role === 'dept_admin' || role === 'super_admin';
}

/**
 * The scopes the create dialog offers. There is one club per department and a moderator's
 * seat is always in their own department's club (D34), so `myClub` covers moderators and
 * dept admins.
 *
 * - moderator: their club only
 * - dept_admin: their department or its club
 * - super_admin: every department and every club
 */
export function createScopeOptions(input: {
  role: Role;
  department: ScopeRef | null;
  myClub: ScopeRef | null;
  clubs: ScopeRef[];
  departments: ScopeRef[];
}): ScopeOptions {
  const { role, department, myClub } = input;
  switch (role) {
    case 'super_admin':
      return { departments: input.departments, clubs: input.clubs };
    case 'dept_admin':
      return { departments: department ? [department] : [], clubs: myClub ? [myClub] : [] };
    case 'moderator':
      return { departments: [], clubs: myClub ? [myClub] : [] };
    default:
      return { departments: [], clubs: [] };
  }
}

/** "CLUB · CSE Club" or "DEPARTMENT · CSE": the badge text, uppercase by request (D39). */
export function scopeLabel(a: Pick<Announcement, 'scope' | 'club' | 'department'>): string {
  return a.scope === 'club'
    ? `CLUB · ${a.club?.name ?? ''}`
    : `DEPARTMENT · ${a.department?.name ?? ''}`;
}
