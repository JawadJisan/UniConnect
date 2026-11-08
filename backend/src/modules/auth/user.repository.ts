import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';

export const userRepository = {
  async departmentExists(db: Db, id: number) {
    return (await db.department.count({ where: { id } })) > 0;
  },

  async emailTaken(db: Db, email: string) {
    return (await db.user.count({ where: { email } })) > 0;
  },

  async studentIdTaken(db: Db, departmentId: number, studentId: string) {
    return (await db.user.count({ where: { departmentId, studentId } })) > 0;
  },

  createUser(db: Db, data: Prisma.UserUncheckedCreateInput) {
    return db.user.create({ data, select: { id: true, email: true, name: true, role: true } });
  },

  /** The credential account Better Auth's own sign-up would write (providerId 'credential'). */
  createCredentialAccount(db: Db, userId: string, passwordHash: string) {
    return db.account.create({
      data: { userId, accountId: userId, providerId: 'credential', password: passwordHash },
      select: { id: true },
    });
  },
};
