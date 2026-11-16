import { z } from 'zod';
import { paginationQueryShape } from './pagination.js';

const positiveId = (label: string) =>
  z.coerce
    .number(`Not a valid ${label}.`)
    .int(`Not a valid ${label}.`)
    .positive(`Not a valid ${label}.`);

/** `/clubs/:id/committee/:memberId`. */
export const committeeMemberParamsSchema = z.object({
  id: positiveId('club id'),
  memberId: positiveId('committee member id'),
});

/** A term year. Committee terms are stored as years only (PRD FR-COMM-002). */
const termYear = z
  .number('Year must be a number.')
  .int('Year must be a whole number.')
  .min(2000, 'Year must be 2000 or later.')
  .max(2100, 'Year must be 2100 or earlier.');

const position = z
  .string('Position is required.')
  .trim()
  .min(2, 'Position must be at least 2 characters.')
  .max(50, 'Position must be at most 50 characters.');

const END_BEFORE_START = 'The end year cannot be before the start year.';

/** GET /api/v1/clubs/:id/committee (PRD FR-COMM-001). Without `is_current`, all rows. */
export const committeeListQuerySchema = z
  .object({
    ...paginationQueryShape,
    is_current: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();

export type CommitteeListQuery = z.infer<typeof committeeListQuerySchema>;
export type CommitteeListParams = z.input<typeof committeeListQuerySchema>;

/** POST /api/v1/clubs/:id/committee (PRD FR-COMM-002). */
export const assignCommitteeSchema = z
  .object({
    user_id: z.uuid('Not a valid user id.'),
    position,
    term_start_year: termYear,
    term_end_year: termYear,
    is_current: z.boolean().default(true),
  })
  .strict()
  .refine((v) => v.term_end_year >= v.term_start_year, {
    message: END_BEFORE_START,
    path: ['term_end_year'],
  });

export type AssignCommitteeInput = z.infer<typeof assignCommitteeSchema>;
export type AssignCommitteeBody = z.input<typeof assignCommitteeSchema>;

/**
 * PATCH /api/v1/clubs/:id/committee/:memberId (PRD FR-COMM-004). Only these fields; the
 * service checks the year order against the stored row when only one year is sent.
 */
export const updateCommitteeSchema = z
  .object({ position, term_start_year: termYear, term_end_year: termYear })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to update.')
  .refine(
    (v) =>
      v.term_start_year === undefined ||
      v.term_end_year === undefined ||
      v.term_end_year >= v.term_start_year,
    { message: END_BEFORE_START, path: ['term_end_year'] },
  );

export type UpdateCommitteeInput = z.infer<typeof updateCommitteeSchema>;

/** One committee row, current or past. Never carries email or phone. */
export const committeeEntrySchema = z.object({
  id: z.number().int().positive(),
  club_id: z.number().int().positive(),
  position: z.string(),
  term_start_year: z.number().int(),
  term_end_year: z.number().int(),
  is_current: z.boolean(),
  user: z.object({ id: z.string(), name: z.string(), avatar_url: z.string().nullable() }),
  updated_at: z.string(),
});

export type CommitteeEntry = z.infer<typeof committeeEntrySchema>;

/**
 * GET /api/v1/clubs/:id/committee/candidates (DECISIONS D34): people the club's editors can
 * assign. `search` matches name or student ID.
 */
export const committeeCandidateQuerySchema = z
  .object({
    search: z
      .string('Type a name or student ID.')
      .trim()
      .min(1, 'Type a name or student ID.')
      .max(100),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  })
  .strict();

export type CommitteeCandidateQuery = z.infer<typeof committeeCandidateQuerySchema>;

/** One assignable person. Never carries email or phone. */
export const committeeCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar_url: z.string().nullable(),
  user_type: z.enum(['student', 'faculty']),
  student_id: z.string().nullable(),
  /** Holds a current seat in this club already, so assigning would be a 409. */
  on_committee: z.boolean(),
});

export type CommitteeCandidate = z.infer<typeof committeeCandidateSchema>;
