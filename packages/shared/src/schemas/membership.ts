import { z } from 'zod';
import { membershipStatusSchema, membershipTypeSchema, paymentStatusSchema } from './enums.js';
import { paginationQueryShape } from './pagination.js';

const positiveId = (label: string) =>
  z.coerce
    .number(`Not a valid ${label}.`)
    .int(`Not a valid ${label}.`)
    .positive(`Not a valid ${label}.`);

export const membershipIdParamSchema = z.object({ id: positiveId('membership id') });

/** POST /api/v1/memberships (PRD FR-MEM-001). */
export const createMembershipSchema = z
  .object({
    club_id: z.number('club_id must be a number.').int().positive('Not a valid club id.'),
    type: membershipTypeSchema,
  })
  .strict();

export type CreateMembershipInput = z.infer<typeof createMembershipSchema>;

/** POST /api/v1/memberships/:id/renew (PRD FR-MEM-002). `type` defaults to the old one. */
export const renewMembershipSchema = z.object({ type: membershipTypeSchema.optional() }).strict();

export type RenewMembershipInput = z.infer<typeof renewMembershipSchema>;

/** GET /api/v1/memberships/my (PRD FR-MEM-004). */
export const myMembershipsQuerySchema = z.object({ ...paginationQueryShape }).strict();

export type MyMembershipsQuery = z.infer<typeof myMembershipsQuerySchema>;

/** GET /api/v1/admin/memberships (PRD FR-MEM-005). */
export const adminMembershipListQuerySchema = z
  .object({
    ...paginationQueryShape,
    status: membershipStatusSchema.optional(),
    type: membershipTypeSchema.optional(),
    club_id: positiveId('club id').optional(),
  })
  .strict();

export type AdminMembershipListQuery = z.infer<typeof adminMembershipListQuerySchema>;
export type AdminMembershipListParams = z.input<typeof adminMembershipListQuerySchema>;

/**
 * POST /api/v1/memberships/payment/ipn. Only `tran_id` and `val_id` are read, and nothing in
 * the body is trusted: the payment is settled from the gateway's Order Validation answer
 * (PRD FR-MEM-001, CLAUDE.md Payments). Other gateway fields are allowed and ignored.
 */
export const paymentIpnSchema = z.looseObject({
  tran_id: z.string().trim().min(1).max(100),
  val_id: z.string().trim().min(1).max(100).optional(),
  status: z.string().max(50).optional(),
});

export type PaymentIpnInput = z.infer<typeof paymentIpnSchema>;

/** The latest payment of a membership. Amounts are strings such as "500.00", never floats. */
export const membershipPaymentSchema = z.object({
  transaction_id: z.string(),
  amount: z.string(),
  currency: z.string(),
  status: paymentStatusSchema,
  validated_at: z.string().nullable(),
});

export type MembershipPayment = z.infer<typeof membershipPaymentSchema>;

/** One membership. Dates are `YYYY-MM-DD`; `end_date` is the last day of membership. */
export const membershipSummarySchema = z.object({
  id: z.number().int().positive(),
  type: membershipTypeSchema,
  status: membershipStatusSchema,
  start_date: z.string(),
  end_date: z.string(),
  created_at: z.string(),
  club: z.object({
    id: z.number().int().positive(),
    name: z.string(),
    logo_url: z.string().nullable(),
    department: z.object({ id: z.number().int().positive(), name: z.string() }),
  }),
  payment: membershipPaymentSchema.nullable(),
});

export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

/** One row of GET /api/v1/admin/memberships. */
export const adminMembershipRowSchema = membershipSummarySchema.extend({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    student_id: z.string().nullable(),
  }),
});

export type AdminMembershipRow = z.infer<typeof adminMembershipRowSchema>;

/** POST /memberships and /memberships/:id/renew: send the browser to `redirect_url`. */
export const checkoutResultSchema = z.object({
  membership: membershipSummarySchema,
  transaction_id: z.string(),
  redirect_url: z.string(),
});

export type CheckoutResult = z.infer<typeof checkoutResultSchema>;
