import { z } from 'zod';
import { paginationQueryShape } from './pagination.js';

/** `YYYY-MM-DD`, a real calendar date. DATE columns carry no time zone (DECISIONS #22). */
export const isoDateSchema = z
  .string('Date is required.')
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Not a valid date.');

export const deptAdminTermIdParamSchema = z.object({
  id: z.coerce
    .number('Not a valid term id.')
    .int('Not a valid term id.')
    .positive('Not a valid term id.'),
});

const END_BEFORE_START = 'The end date cannot be before the start date.';

const termDates = {
  start_date: isoDateSchema,
  end_date: isoDateSchema,
};

/** POST /api/v1/admin/dept-admin-terms (PRD FR-ADMIN-001). */
export const assignDeptAdminSchema = z
  .object({
    user_id: z.uuid('Not a valid user id.'),
    department_id: z
      .number('department_id must be a number.')
      .int()
      .positive('Not a valid department id.'),
    ...termDates,
  })
  .strict()
  .refine((v) => v.end_date >= v.start_date, { message: END_BEFORE_START, path: ['end_date'] });

export type AssignDeptAdminInput = z.infer<typeof assignDeptAdminSchema>;

/** POST /api/v1/admin/dept-admin-terms/:id/renew (PRD FR-ADMIN-003). The new term's dates. */
export const renewDeptAdminSchema = z
  .object(termDates)
  .strict()
  .refine((v) => v.end_date >= v.start_date, { message: END_BEFORE_START, path: ['end_date'] });

export type RenewDeptAdminInput = z.infer<typeof renewDeptAdminSchema>;

/** GET /api/v1/admin/dept-admin-terms (PRD FR-ADMIN-004). */
export const deptAdminTermListQuerySchema = z
  .object({
    ...paginationQueryShape,
    department_id: z.coerce.number().int().positive().optional(),
    user_id: z.uuid('Not a valid user id.').optional(),
    is_current: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();

export type DeptAdminTermListQuery = z.infer<typeof deptAdminTermListQuerySchema>;
export type DeptAdminTermListParams = z.input<typeof deptAdminTermListQuerySchema>;

/** One term. `end_date` is the last day of the term. */
export const deptAdminTermSchema = z.object({
  id: z.number().int().positive(),
  start_date: z.string(),
  end_date: z.string(),
  is_current: z.boolean(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    avatar_url: z.string().nullable(),
  }),
  department: z.object({ id: z.number().int().positive(), name: z.string() }),
  created_at: z.string(),
  updated_at: z.string(),
});

export type DeptAdminTerm = z.infer<typeof deptAdminTermSchema>;
