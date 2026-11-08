import type { Db } from './audit.repository.js';

export const roleRepository = {
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
