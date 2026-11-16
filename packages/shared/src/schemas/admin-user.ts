import { z } from 'zod';
import { academicSessionSchema, nameSchema, phoneSchema, studentIdSchema } from './auth.js';
import { bloodGroupSchema, roleSchema, userTypeSchema } from './enums.js';
import { paginationQueryShape } from './pagination.js';
import { userProfileSchema } from './user.js';

/** Sortable columns of GET /api/v1/admin/users. A whitelist: nothing else reaches orderBy. */
export const ADMIN_USER_SORTS = ['created_at', 'name', 'email'] as const;

/** GET /api/v1/admin/users query (PRD FR-USER-005). Unknown keys are a 400. */
export const adminUserListQuerySchema = z
  .object({
    ...paginationQueryShape,
    sort: z.enum(ADMIN_USER_SORTS).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
    role: roleSchema.optional(),
    user_type: userTypeSchema.optional(),
    department_id: z.coerce.number().int().positive().optional(),
    is_active: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    /** Case-insensitive match on name or email. */
    search: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
/** The query as the browser sends it, before defaults and coercion. */
export type AdminUserListParams = z.input<typeof adminUserListQuerySchema>;

export const userIdParamSchema = z.object({ id: z.uuid('Not a valid user id.') });

/** PATCH /api/v1/admin/users/:id/status. Suspending also revokes every session. */
export const updateUserStatusSchema = z
  .object({
    is_active: z.boolean(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

/**
 * PATCH /api/v1/admin/users/:id: super_admin assisting a user (PRD FR-USER-002, DECISIONS D29).
 * Academic fields are accepted only when the target is a student; the service checks that.
 */
export const adminUpdateUserSchema = z
  .object({
    name: nameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    blood_group: bloodGroupSchema.optional(),
    department_id: z.number().int().positive().optional(),
    academic_session: academicSessionSchema.optional(),
    current_year: z.number().int().min(1).max(4).optional(),
    current_semester: z.number().int().min(1).max(2).optional(),
    student_id: studentIdSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to update.');

export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

/** The academic fields only a student has. */
export const ACADEMIC_FIELDS = [
  'academic_session',
  'current_year',
  'current_semester',
  'student_id',
] as const;

/** One row of GET /api/v1/admin/users. */
export const adminUserSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  avatar_url: z.string().nullable(),
  user_type: userTypeSchema,
  role: roleSchema,
  department: z.object({ id: z.number().int(), name: z.string() }).nullable(),
  is_active: z.boolean(),
  email_verified: z.boolean(),
  created_at: z.string(),
});

export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;

/** GET /api/v1/admin/users/:id: the profile plus what explains the account's state. */
export const adminUserDetailSchema = userProfileSchema.extend({
  active_sessions: z.number().int(),
  last_login_at: z.string().nullable(),
  /** The current terms that grant the derived role. Empty when the role follows user_type. */
  role_sources: z.object({
    committee: z.array(
      z.object({
        club_id: z.number().int(),
        club_name: z.string(),
        position: z.string(),
        term_start_year: z.number().int(),
        term_end_year: z.number().int(),
      }),
    ),
    dept_admin: z
      .object({
        department_id: z.number().int(),
        department_name: z.string(),
        /** YYYY-MM-DD. */
        start_date: z.string(),
        end_date: z.string(),
      })
      .nullable(),
  }),
});

export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/** POST /api/v1/admin/users/:id/recompute-role. */
export const recomputeRoleResultSchema = z.object({
  role: roleSchema,
  previous_role: roleSchema,
  changed: z.boolean(),
});

export type RecomputeRoleResult = z.infer<typeof recomputeRoleResultSchema>;
