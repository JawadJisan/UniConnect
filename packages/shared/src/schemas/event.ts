import { z } from 'zod';
import {
  EVENT_REGISTRATION_STATUSES,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
} from '../constants/index.js';
import { feeSchema } from './club.js';
import { PAGE_LIMIT_MAX, paginationQueryShape } from './pagination.js';

// Events (PRD FR-EVENT-001–012, DECISIONS D36).

/** Multipart field for PATCH /api/v1/events/:id/poster (FR-EVENT-002). */
export const POSTER_FIELD = 'poster';

/** Browse defaults to 10 a page (PRD FR-EVENT-006); the D9 cap still applies. */
export const EVENT_PAGE_LIMIT_DEFAULT = 10;

const positiveId = (label: string) =>
  z.coerce
    .number(`Not a valid ${label}.`)
    .int(`Not a valid ${label}.`)
    .positive(`Not a valid ${label}.`);

/** `/events/:id`. */
export const eventIdParamSchema = z.object({ id: positiveId('event id') });

/** `/events/:id/registrations/:regId`. */
export const registrationParamsSchema = z.object({
  id: positiveId('event id'),
  regId: positiveId('registration id'),
});

/** ISO 8601 with an offset, e.g. `2026-12-01T10:00:00+06:00`. */
const dateTime = (label: string) =>
  z.iso.datetime({ offset: true, message: `${label} must be a date and time with a time zone.` });

const title = z
  .string('Title is required.')
  .trim()
  .min(1, 'Title is required.')
  .max(200, 'Title must be at most 200 characters.');
const description = z.string().trim().max(5000, 'Description must be at most 5000 characters.');
const venue = z.string().trim().max(200, 'Venue must be at most 200 characters.');
const maxAttendees = z
  .number('Capacity must be a number.')
  .int('Capacity must be a whole number.')
  .min(1, 'Capacity must be at least 1.')
  .max(100000, 'Capacity must be at most 100000.');
const departmentIds = z
  .array(positiveId('department id'), 'Choose at least one department.')
  .min(1, 'Choose at least one department.')
  .max(50, 'At most 50 departments.')
  .transform((ids) => [...new Set(ids)]);

const END_BEFORE_START = 'The event must end after it starts.';
const FEE_REQUIRED = 'A paid event needs a fee.';
const FEE_ONLY_WHEN_PAID = 'Only a paid event can have a fee.';

const endsAfterStart = (v: { start_date?: string; end_date?: string }) =>
  v.start_date === undefined ||
  v.end_date === undefined ||
  new Date(v.end_date).getTime() > new Date(v.start_date).getTime();

/**
 * POST /api/v1/events (FR-EVENT-001). The poster is uploaded separately, so
 * `poster_image_url` is not accepted. Paid events are stored and shown only; registration
 * takes no payment (PRD #16, confirmed 2026-11-12).
 */
export const createEventSchema = z
  .object({
    title,
    description: description.optional(),
    organizer_club_id: positiveId('club id'),
    visibility: z.enum(EVENT_VISIBILITIES).default('public'),
    is_paid: z.boolean().default(false),
    fee_amount: feeSchema.optional(),
    start_date: dateTime('Start'),
    end_date: dateTime('End'),
    venue: venue.optional(),
    max_attendees: maxAttendees.optional(),
    department_ids: departmentIds,
  })
  .strict()
  .refine(endsAfterStart, { message: END_BEFORE_START, path: ['end_date'] })
  .refine((v) => !v.is_paid || v.fee_amount !== undefined, {
    message: FEE_REQUIRED,
    path: ['fee_amount'],
  })
  .refine((v) => v.is_paid || v.fee_amount === undefined, {
    message: FEE_ONLY_WHEN_PAID,
    path: ['fee_amount'],
  });

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateEventBody = z.input<typeof createEventSchema>;

/**
 * PATCH /api/v1/events/:id (FR-EVENT-004). `null` clears an optional field. The service
 * checks the result against the stored row (date order, fee rule, field locks after publish).
 */
export const updateEventSchema = z
  .object({
    title,
    description: description.nullable(),
    visibility: z.enum(EVENT_VISIBILITIES),
    is_paid: z.boolean(),
    fee_amount: feeSchema.nullable(),
    start_date: dateTime('Start'),
    end_date: dateTime('End'),
    venue: venue.nullable(),
    max_attendees: maxAttendees.nullable(),
    department_ids: departmentIds,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to update.')
  .refine(endsAfterStart, { message: END_BEFORE_START, path: ['end_date'] });

export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type UpdateEventBody = z.input<typeof updateEventSchema>;

/** `status` filters of GET /events. `draft` returns only drafts the caller manages. */
export const EVENT_LIST_STATUSES = ['upcoming', 'past', 'published', 'draft', 'cancelled'] as const;

const booleanString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** GET /api/v1/events (FR-EVENT-006). */
export const eventListQuerySchema = z
  .object({
    ...paginationQueryShape,
    limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(EVENT_PAGE_LIMIT_DEFAULT),
    department_id: positiveId('department id').optional(),
    club_id: positiveId('club id').optional(),
    visibility: z.enum(EVENT_VISIBILITIES).optional(),
    status: z.enum(EVENT_LIST_STATUSES).optional(),
    is_paid: booleanString,
    search: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type EventListQuery = z.infer<typeof eventListQuerySchema>;
export type EventListParams = z.input<typeof eventListQuerySchema>;

/** GET /api/v1/events/my-registrations (FR-EVENT-009). */
export const myRegistrationsQuerySchema = z
  .object({ ...paginationQueryShape, when: z.enum(['upcoming', 'past']).optional() })
  .strict();

export type MyRegistrationsQuery = z.infer<typeof myRegistrationsQuerySchema>;
export type MyRegistrationsParams = z.input<typeof myRegistrationsQuerySchema>;

/** GET /api/v1/events/:id/registrations (FR-EVENT-011). `format=csv` returns every row. */
export const eventRegistrationsQuerySchema = z
  .object({
    ...paginationQueryShape,
    status: z.enum(EVENT_REGISTRATION_STATUSES).optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .strict();

export type EventRegistrationsQuery = z.infer<typeof eventRegistrationsQuerySchema>;
export type EventRegistrationsParams = z.input<typeof eventRegistrationsQuerySchema>;

const ref = z.object({ id: z.number().int().positive(), name: z.string() });

/** One row of GET /api/v1/events. `fee_amount` is a string such as "200.00", never a float. */
export const eventSummarySchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  description: z.string().nullable(),
  organizer_club: ref,
  visibility: z.enum(EVENT_VISIBILITIES),
  is_paid: z.boolean(),
  fee_amount: z.string().nullable(),
  start_date: z.string(),
  end_date: z.string(),
  venue: z.string().nullable(),
  max_attendees: z.number().int().nullable(),
  /** Seats taken: `registered` and `attended` registrations. */
  registered_count: z.number().int(),
  poster_image_url: z.string().nullable(),
  status: z.enum(EVENT_STATUSES),
  departments: z.array(ref),
  created_at: z.string(),
  updated_at: z.string(),
});

export type EventSummary = z.infer<typeof eventSummarySchema>;

/** Why the caller can't register, when `can_register` is false. */
export const REGISTER_BLOCKED_REASONS = [
  'not_open',
  'full',
  'not_eligible',
  'already_registered',
  'super_admin',
  'no_show',
] as const;

/** GET /api/v1/events/:id: the summary plus counts and what the caller may do. */
export const eventDetailSchema = eventSummarySchema.extend({
  my_registration: z
    .object({ id: z.number().int(), status: z.enum(EVENT_REGISTRATION_STATUSES) })
    .nullable(),
  can_manage: z.boolean(),
  can_register: z.boolean(),
  register_blocked_reason: z.enum(REGISTER_BLOCKED_REASONS).nullable(),
});

export type EventDetail = z.infer<typeof eventDetailSchema>;

/** One registrant, for organizers. Never carries email or phone (DECISIONS D36). */
export const eventRegistrationSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(EVENT_REGISTRATION_STATUSES),
  registered_at: z.string(),
  checked_in_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    avatar_url: z.string().nullable(),
    student_id: z.string().nullable(),
    department: ref.nullable(),
  }),
});

export type EventRegistration = z.infer<typeof eventRegistrationSchema>;

/** One row of GET /api/v1/events/my-registrations. */
export const myRegistrationSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(EVENT_REGISTRATION_STATUSES),
  registered_at: z.string(),
  checked_in_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  event: eventSummarySchema,
});

export type MyRegistration = z.infer<typeof myRegistrationSchema>;
