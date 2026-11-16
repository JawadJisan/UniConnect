import { z } from 'zod';
import { phoneSchema } from './auth.js';
import { isoDateSchema } from './dept-admin-term.js';
import { bloodGroupSchema, bloodRequestStatusSchema } from './enums.js';
import { paginationQueryShape } from './pagination.js';

// Blood donations and requests (PRD FR-BLOOD-001–010; DECISIONS D14, D40).

const positiveId = (label: string) =>
  z.coerce
    .number(`Not a valid ${label}.`)
    .int(`Not a valid ${label}.`)
    .positive(`Not a valid ${label}.`);

/** `/blood/donations/:id` and `/blood/requests/:id`. */
export const bloodIdParamSchema = z.object({ id: positiveId('id') });

export const DONATION_UNITS_MAX = 4;
export const REQUEST_UNITS_MAX = 20;
export const BLOOD_NOTES_MAX = 1000;
export const HOSPITAL_NAME_MAX = 200;
export const PATIENT_NAME_MAX = 100;

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

/**
 * POST /api/v1/blood/donations (FR-BLOOD-001). The blood group comes from the donor's profile.
 * The service refuses a `donation_date` after today in Asia/Dhaka.
 */
export const createDonationSchema = z
  .object({
    donation_date: isoDateSchema,
    units: z.coerce
      .number('Units must be a number.')
      .int('Units must be a whole number.')
      .min(1, 'At least 1 unit.')
      .max(DONATION_UNITS_MAX, `At most ${DONATION_UNITS_MAX} units.`)
      .default(1),
    hospital_name: optionalText(HOSPITAL_NAME_MAX, 'Hospital name'),
    notes: optionalText(BLOOD_NOTES_MAX, 'Notes'),
  })
  .strict();

export type CreateDonationInput = z.infer<typeof createDonationSchema>;
export type CreateDonationBody = z.input<typeof createDonationSchema>;

/**
 * POST /api/v1/blood/requests (FR-BLOOD-005). The service refuses a `required_by_date`
 * before today in Asia/Dhaka (today itself is allowed; D40).
 */
export const createBloodRequestSchema = z
  .object({
    patient_name: z
      .string('Patient name is required.')
      .trim()
      .min(1, 'Patient name is required.')
      .max(PATIENT_NAME_MAX, `Patient name must be at most ${PATIENT_NAME_MAX} characters.`),
    blood_group: bloodGroupSchema,
    units_needed: z.coerce
      .number('Units must be a number.')
      .int('Units must be a whole number.')
      .min(1, 'At least 1 unit.')
      .max(REQUEST_UNITS_MAX, `At most ${REQUEST_UNITS_MAX} units.`),
    reason: optionalText(BLOOD_NOTES_MAX, 'Reason'),
    contact_phone: phoneSchema,
    hospital_name: z
      .string('Hospital name is required.')
      .trim()
      .min(1, 'Hospital name is required.')
      .max(HOSPITAL_NAME_MAX, `Hospital name must be at most ${HOSPITAL_NAME_MAX} characters.`),
    required_by_date: isoDateSchema,
  })
  .strict();

export type CreateBloodRequestInput = z.infer<typeof createBloodRequestSchema>;
export type CreateBloodRequestBody = z.input<typeof createBloodRequestSchema>;

const booleanQuery = (label: string) =>
  z
    .enum(['true', 'false'], `${label} must be true or false.`)
    .transform((v) => v === 'true')
    .optional();

/** GET /api/v1/blood/donations/my (FR-BLOOD-003). */
export const myDonationsQuerySchema = z.object({ ...paginationQueryShape }).strict();
export type MyDonationsQuery = z.infer<typeof myDonationsQuerySchema>;

/** GET /api/v1/blood/donors (FR-BLOOD-004). */
export const donorListQuerySchema = z
  .object({
    ...paginationQueryShape,
    blood_group: bloodGroupSchema.optional(),
    department_id: positiveId('department id').optional(),
    verified_only: booleanQuery('verified_only'),
  })
  .strict();

export type DonorListQuery = z.infer<typeof donorListQuerySchema>;
export type DonorListParams = z.input<typeof donorListQuerySchema>;

/** GET /api/v1/blood/requests (FR-BLOOD-006). `status` defaults to `pending`. */
export const bloodRequestListQuerySchema = z
  .object({
    ...paginationQueryShape,
    status: bloodRequestStatusSchema.default('pending'),
    blood_group: bloodGroupSchema.optional(),
    /** The requester's department (requests have no department of their own; D40). */
    department_id: positiveId('department id').optional(),
  })
  .strict();

export type BloodRequestListQuery = z.infer<typeof bloodRequestListQuerySchema>;
export type BloodRequestListParams = z.input<typeof bloodRequestListQuerySchema>;

/** GET /api/v1/admin/blood/donations/unverified (FR-BLOOD-010). */
export const unverifiedDonationsQuerySchema = z
  .object({
    ...paginationQueryShape,
    department_id: positiveId('department id').optional(),
  })
  .strict();

export type UnverifiedDonationsQuery = z.infer<typeof unverifiedDonationsQuerySchema>;
export type UnverifiedDonationsParams = z.input<typeof unverifiedDonationsQuerySchema>;

const ref = z.object({ id: z.number().int().positive(), name: z.string() });
const userRef = z.object({ id: z.string(), name: z.string() });

/** One of the caller's own donations (FR-BLOOD-003). */
export const donationSchema = z.object({
  id: z.number().int().positive(),
  blood_group: bloodGroupSchema,
  donation_date: z.string(),
  units: z.number().int(),
  hospital_name: z.string().nullable(),
  notes: z.string().nullable(),
  verified: z.boolean(),
  verified_at: z.string().nullable(),
  verifier: userRef.nullable(),
  created_at: z.string(),
});

export type Donation = z.infer<typeof donationSchema>;

/** A row of the admin verification queue (FR-BLOOD-010). Never carries email. */
export const unverifiedDonationSchema = donationSchema.extend({
  donor: userRef.extend({ student_id: z.string().nullable(), department: ref.nullable() }),
});

export type UnverifiedDonation = z.infer<typeof unverifiedDonationSchema>;

/**
 * A donor directory row (FR-BLOOD-004; D14 resolved 2026-11-14): phone is shown to every
 * signed-in user when the donor set one. Email is never included.
 */
export const donorSchema = z.object({
  id: z.string(),
  name: z.string(),
  blood_group: bloodGroupSchema,
  department: ref.nullable(),
  /** Latest verified donation date, or null when none is verified yet. */
  last_donation_date: z.string().nullable(),
  phone: z.string().nullable(),
  /** At least one verified donation. */
  verified: z.boolean(),
});

export type Donor = z.infer<typeof donorSchema>;

/** One blood request (FR-BLOOD-006). The requester's email is never included. */
export const bloodRequestSchema = z.object({
  id: z.number().int().positive(),
  patient_name: z.string(),
  blood_group: bloodGroupSchema,
  units_needed: z.number().int(),
  reason: z.string().nullable(),
  contact_phone: z.string(),
  hospital_name: z.string(),
  required_by_date: z.string(),
  status: bloodRequestStatusSchema,
  requester: userRef.extend({ department: ref.nullable() }),
  fulfiller: userRef.nullable(),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
  /** The caller may mark it fulfilled (pending and not their own). */
  can_fulfill: z.boolean(),
  /** The caller may cancel it (pending, and requester, their dept_admin or a super_admin). */
  can_cancel: z.boolean(),
});

export type BloodRequest = z.infer<typeof bloodRequestSchema>;
