import type { ClubSummary, UserProfile } from '@uniconnect/shared';

/**
 * Whether to show a club's edit panels: a super admin, or the dept_admin of the club's
 * department (PRD FR-CLUB-003). Display only: the API enforces the same rule (DECISIONS D31).
 */
export function canEditClub(
  profile: Pick<UserProfile, 'role' | 'department'>,
  club: Pick<ClubSummary, 'department'>,
): boolean {
  if (profile.role === 'super_admin') return true;
  return profile.role === 'dept_admin' && profile.department?.id === club.department.id;
}
