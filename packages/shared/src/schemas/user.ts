import { z } from 'zod';
import {
  academicSessionSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
  studentIdSchema,
} from './auth.js';
import { bloodGroupSchema, roleSchema, userTypeSchema } from './enums.js';

/** Avatar upload limits (PRD FR-USER-003, decision #21). */
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
/** The multipart field the avatar file is sent in. */
export const AVATAR_FIELD = 'avatar';

const AT_LEAST_ONE = 'Send at least one field to update.';
const hasAnyKey = (value: object) => Object.keys(value).length > 0;

// Fields every user may change on their own profile. Phone is optional, so `null` clears it.
const staffFields = {
  name: nameSchema.optional(),
  phone: phoneSchema.nullable().optional(),
  blood_group: bloodGroupSchema.optional(),
};

/**
 * PATCH /api/v1/users/me for `user_type = faculty` (and super_admin). .strict(): academic
 * fields, department_id, role, user_type and every other key are a 400 (PRD FR-USER-002).
 */
export const updateStaffProfileSchema = z
  .object(staffFields)
  .strict()
  .refine(hasAnyKey, AT_LEAST_ONE);

/** PATCH /api/v1/users/me for `user_type = student`. Academic fields may change, not be cleared. */
export const updateStudentProfileSchema = z
  .object({
    ...staffFields,
    academic_session: academicSessionSchema.optional(),
    current_year: z.number().int().min(1).max(4).optional(),
    current_semester: z.number().int().min(1).max(2).optional(),
    student_id: studentIdSchema.optional(),
  })
  .strict()
  .refine(hasAnyKey, AT_LEAST_ONE);

export type UpdateStaffProfileInput = z.infer<typeof updateStaffProfileSchema>;
export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;
export type UpdateProfileInput = UpdateStaffProfileInput | UpdateStudentProfileInput;

/**
 * Form schema for Better Auth's POST /api/auth/change-password (PRD FR-USER-004). Send only
 * `currentPassword` and `newPassword`; the server always revokes other sessions.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one.',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** The body of GET/PATCH /api/v1/users/me. Never carries password hashes or tokens. */
export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  email_verified: z.boolean(),
  avatar_url: z.string().nullable(),
  user_type: userTypeSchema,
  role: roleSchema,
  is_active: z.boolean(),
  department: z.object({ id: z.number().int(), name: z.string() }).nullable(),
  blood_group: bloodGroupSchema.nullable(),
  phone: z.string().nullable(),
  academic_session: z.string().nullable(),
  current_year: z.number().int().nullable(),
  current_semester: z.number().int().nullable(),
  student_id: z.string().nullable(),
  /** YYYY-MM-DD. */
  last_donation_date: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
