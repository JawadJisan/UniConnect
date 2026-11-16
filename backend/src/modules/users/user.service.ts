import {
  AUDIT_ACTIONS,
  updateStaffProfileSchema,
  updateStudentProfileSchema,
  type MySessions,
  type UpdateProfileInput,
  type UpdateStudentProfileInput,
  type UserProfile,
} from '@uniconnect/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { uploadAvatar } from '../../lib/cloudinary.js';
import { badRequest, conflict, notFound } from '../../lib/http-error.js';
import { isAllowedImage } from '../../lib/image.js';
import { prisma } from '../../lib/prisma.js';
import { INVALID_TYPE_MESSAGE } from '../../middleware/upload.js';
import { parseOrError } from '../../middleware/validate.js';
import { auditService } from '../../services/audit.service.js';
import { userProfileRepository, type ProfileRow } from './user.repository.js';

/** Who is acting: the signed-in user, from req.auth. */
export interface Caller {
  id: string;
  userType: string;
  ip: string | null;
}

const STUDENT_ID_TAKEN = () => conflict('STUDENT_ID_TAKEN', 'Student ID already registered.');

/** API field → Prisma field. Only these can ever be written through PATCH /users/me. */
const FIELD_MAP = {
  name: 'name',
  phone: 'phone',
  blood_group: 'bloodGroup',
  academic_session: 'academicSession',
  current_year: 'currentYear',
  current_semester: 'currentSemester',
  student_id: 'studentId',
} as const satisfies Record<keyof UpdateStudentProfileInput, keyof ProfileRow>;

type ApiField = keyof typeof FIELD_MAP;

export function toProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    email_verified: row.emailVerified,
    avatar_url: row.image,
    user_type: row.userType as UserProfile['user_type'],
    role: row.role as UserProfile['role'],
    is_active: row.isActive,
    department: row.department,
    blood_group: row.bloodGroup as UserProfile['blood_group'],
    phone: row.phone,
    academic_session: row.academicSession,
    current_year: row.currentYear,
    current_semester: row.currentSemester,
    student_id: row.studentId,
    last_donation_date: row.lastDonationDate?.toISOString().slice(0, 10) ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** The schema is chosen by user_type, never by the derived role (a moderator is a student). */
function parseUpdate(userType: string, body: unknown): UpdateProfileInput {
  const schema = userType === 'student' ? updateStudentProfileSchema : updateStaffProfileSchema;
  const result = parseOrError<UpdateProfileInput>(schema, body);
  if (!result.ok) throw result.error;
  return result.data;
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export const userService = {
  async getMe(userId: string): Promise<UserProfile> {
    const row = await userProfileRepository.findProfile(prisma, userId);
    if (!row) throw notFound('User not found.');
    return toProfile(row);
  },

  /** How many other devices are signed in (FR-AUTH-005.4). A count only, never tokens. */
  async mySessions(userId: string, currentSessionId: string): Promise<MySessions> {
    const others = await userProfileRepository.countOtherActiveSessions(
      prisma,
      userId,
      currentSessionId,
    );
    return { other_sessions: others };
  },

  async updateMe(caller: Caller, body: unknown): Promise<UserProfile> {
    const input = parseUpdate(caller.userType, body);
    const fields = Object.keys(input) as ApiField[];

    try {
      const row = await prisma.$transaction(async (tx) => {
        const before = await userProfileRepository.findProfile(tx, caller.id);
        if (!before) throw notFound('User not found.');

        const studentId = (input as UpdateStudentProfileInput).student_id;
        if (
          studentId !== undefined &&
          studentId !== before.studentId &&
          before.departmentId !== null &&
          (await userProfileRepository.studentIdTakenByOther(
            tx,
            before.departmentId,
            studentId,
            caller.id,
          ))
        ) {
          throw STUDENT_ID_TAKEN();
        }

        const data: Prisma.UserUncheckedUpdateInput = {};
        const oldValue: Record<string, unknown> = {};
        const newValue: Record<string, unknown> = {};
        for (const field of fields) {
          const column = FIELD_MAP[field];
          const value = (input as Record<ApiField, unknown>)[field];
          (data as Record<string, unknown>)[column] = value;
          if (before[column] !== value) {
            oldValue[field] = before[column];
            newValue[field] = value;
          }
        }

        const after = await userProfileRepository.updateProfile(tx, caller.id, data);
        // Nothing actually changed: no audit row for a no-op save.
        if (Object.keys(newValue).length > 0) {
          await auditService.record(tx, {
            userId: caller.id,
            action: AUDIT_ACTIONS.PROFILE_UPDATED,
            entityType: 'user',
            entityId: caller.id,
            oldValue: oldValue as Prisma.InputJsonValue,
            newValue: newValue as Prisma.InputJsonValue,
            ipAddress: caller.ip,
          });
        }
        return after;
      });
      return toProfile(row);
    } catch (err) {
      // Email never changes here, so the only unique index this update can hit is
      // users_student_id_per_dept: a parallel request took the ID after the pre-check.
      if (isUniqueViolation(err)) throw STUDENT_ID_TAKEN();
      throw err;
    }
  },

  async updateAvatar(caller: Caller, file: Buffer): Promise<UserProfile> {
    if (!isAllowedImage(file)) throw badRequest('INVALID_FILE_TYPE', INVALID_TYPE_MESSAGE);

    // The upload can't join a database transaction. It runs first, and the URL is saved after;
    // the user's public_id is fixed, so a failed save leaves no extra file behind.
    const url = await uploadAvatar(caller.id, file);

    const row = await prisma.$transaction(async (tx) => {
      const before = await userProfileRepository.findProfile(tx, caller.id);
      if (!before) throw notFound('User not found.');
      const after = await userProfileRepository.updateProfile(tx, caller.id, { image: url });
      await auditService.record(tx, {
        userId: caller.id,
        action: AUDIT_ACTIONS.AVATAR_UPDATED,
        entityType: 'user',
        entityId: caller.id,
        oldValue: { avatar_url: before.image },
        newValue: { avatar_url: url },
        ipAddress: caller.ip,
      });
      return after;
    });
    return toProfile(row);
  },
};
