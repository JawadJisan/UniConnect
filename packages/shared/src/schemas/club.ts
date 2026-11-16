import { z } from 'zod';
import { paginationQueryShape } from './pagination.js';

/** The multipart field a club logo is sent in. Type and size limits are the avatar's (#21). */
export const LOGO_FIELD = 'logo';

export const clubIdParamSchema = z.object({
  id: z.coerce
    .number('Not a valid club id.')
    .int('Not a valid club id.')
    .positive('Not a valid club id.'),
});

/** GET /api/v1/clubs (PRD FR-CLUB-004). Unknown keys are a 400. */
export const clubListQuerySchema = z.object({ ...paginationQueryShape }).strict();

export type ClubListQuery = z.infer<typeof clubListQuerySchema>;
export type ClubListParams = z.input<typeof clubListQuerySchema>;

const FEE_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
/** The fee rule in words, for forms that validate a fee field themselves. */
export const FEE_MESSAGE = 'Fee must be a non-negative amount with at most 2 decimal places.';

/**
 * A BDT amount for DECIMAL(10,2). Accepts `500`, `500.5` or `"500.50"` and normalizes to a
 * 2-decimal string, so the value never passes through float arithmetic on the server.
 */
export const feeSchema = z
  .union([z.number(), z.string().trim()])
  .transform((v) => String(v))
  .refine((v) => FEE_PATTERN.test(v), FEE_MESSAGE)
  .transform((v) => {
    const [whole, fraction = ''] = v.split('.');
    return `${String(Number(whole))}.${fraction.padEnd(2, '0')}`;
  });

/**
 * PATCH /api/v1/clubs/:id (PRD FR-CLUB-003, DECISIONS D31). `logo_url` is not accepted: the
 * logo changes only through PATCH /clubs/:id/logo, so only Cloudinary URLs are ever stored.
 */
export const updateClubSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100),
    description: z.string().trim().max(2000).nullable(),
    membership_fee_monthly: feeSchema.nullable(),
    membership_fee_yearly: feeSchema.nullable(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to update.');

export type UpdateClubInput = z.infer<typeof updateClubSchema>;
export type UpdateClubBody = z.input<typeof updateClubSchema>;

/** One row of GET /api/v1/clubs. Fees are strings such as "500.00", never floats. */
export const clubSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
  logo_url: z.string().nullable(),
  membership_fee_monthly: z.string().nullable(),
  membership_fee_yearly: z.string().nullable(),
  department: z.object({ id: z.number().int().positive(), name: z.string() }),
  updated_at: z.string(),
});

export type ClubSummary = z.infer<typeof clubSummarySchema>;

/** A current committee row. Never carries email or phone. */
export const committeeMemberSchema = z.object({
  id: z.number().int().positive(),
  position: z.string(),
  term_start_year: z.number().int(),
  term_end_year: z.number().int(),
  user: z.object({ id: z.string(), name: z.string(), avatar_url: z.string().nullable() }),
});

export type CommitteeMember = z.infer<typeof committeeMemberSchema>;

/** GET /api/v1/clubs/:id and /clubs/my-club (PRD FR-CLUB-001, 002). */
export const clubDetailSchema = clubSummarySchema.extend({
  committee: z.array(committeeMemberSchema),
});

export type ClubDetail = z.infer<typeof clubDetailSchema>;
