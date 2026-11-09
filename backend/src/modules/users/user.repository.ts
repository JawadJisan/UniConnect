import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';

/**
 * The columns a user may see of their own row. An allowlist, so a column added later is not
 * exposed by accident. Password hashes (`accounts.password`) and tokens (`verifications`) live
 * in other tables and are never joined here.
 */
export const PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  emailVerified: true,
  image: true,
  userType: true,
  role: true,
  isActive: true,
  department: { select: { id: true, name: true } },
  departmentId: true,
  bloodGroup: true,
  phone: true,
  academicSession: true,
  currentYear: true,
  currentSemester: true,
  studentId: true,
  lastDonationDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type ProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

export const userProfileRepository = {
  findProfile(db: Db, id: string) {
    return db.user.findUnique({ where: { id }, select: PROFILE_SELECT });
  },

  /** True when another user in the department already holds this student ID. */
  async studentIdTakenByOther(db: Db, departmentId: number, studentId: string, userId: string) {
    const count = await db.user.count({
      where: { departmentId, studentId, NOT: { id: userId } },
    });
    return count > 0;
  },

  updateProfile(db: Db, id: string, data: Prisma.UserUncheckedUpdateInput) {
    return db.user.update({ where: { id }, data, select: PROFILE_SELECT });
  },
};
