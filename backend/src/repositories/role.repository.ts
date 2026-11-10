import type { Db } from './audit.repository.js';

export const roleRepository = {
  /**
   * Locks the user row until the transaction ends (DECISIONS D12), so concurrent role, status
   * and profile changes for one user run one after another. False when the user doesn't exist.
   */
  async lockUser(db: Db, userId: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    return rows.length > 0;
  },

  findUserTypeAndRole(db: Db, userId: string) {
    return db.user.findUnique({ where: { id: userId }, select: { userType: true, role: true } });
  },

  async hasCurrentDeptAdminTerm(db: Db, userId: string) {
    return (await db.departmentAdminTerm.count({ where: { userId, isCurrent: true } })) > 0;
  },

  async hasCurrentCommitteePosition(db: Db, userId: string) {
    return (await db.clubCommitteeMember.count({ where: { userId, isCurrent: true } })) > 0;
  },

  updateRole(db: Db, userId: string, role: string) {
    return db.user.update({ where: { id: userId }, data: { role }, select: { id: true } });
  },
};
