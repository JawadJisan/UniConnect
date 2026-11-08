import { AUDIT_ACTIONS, type Role, type UserType } from '@uniconnect/shared';
import type { Db } from '../repositories/audit.repository.js';
import { roleRepository } from '../repositories/role.repository.js';
import { auditService } from './audit.service.js';

// User.role is derived and only this service writes it (docs/DATABASE_SCHEMA_V1.md §20).
export const roleService = {
  /** The role a brand-new user starts with: no terms exist yet, so it follows user_type. */
  initialRole(userType: UserType): Role {
    return userType;
  },

  /**
   * Recomputes the effective role from user_type and every current term, highest authority
   * first, and writes it (with a ROLE_CHANGED audit row) only when it changed. Call it inside
   * the transaction that changed a term.
   */
  async recompute(db: Db, userId: string, actorId: string | null = null): Promise<Role> {
    const user = await roleRepository.findUserTypeAndRole(db, userId);
    if (!user) throw new Error(`RoleService.recompute: user ${userId} not found`);

    let next: Role;
    if (user.userType === 'super_admin') next = 'super_admin';
    else if (await roleRepository.hasCurrentDeptAdminTerm(db, userId)) next = 'dept_admin';
    else if (await roleRepository.hasCurrentCommitteePosition(db, userId)) next = 'moderator';
    else next = user.userType as Role;

    if (next !== user.role) {
      await roleRepository.updateRole(db, userId, next);
      await auditService.record(db, {
        userId: actorId,
        action: AUDIT_ACTIONS.ROLE_CHANGED,
        entityType: 'user',
        entityId: userId,
        oldValue: { role: user.role },
        newValue: { role: next },
      });
    }
    return next;
  },
};
