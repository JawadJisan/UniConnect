import { z } from 'zod';
import { paginationQueryShape } from './pagination.js';

// Announcements (PRD FR-ANNOUNCE-001–004; DECISIONS D15, D38).

const positiveId = (label: string) =>
  z.coerce
    .number(`Not a valid ${label}.`)
    .int(`Not a valid ${label}.`)
    .positive(`Not a valid ${label}.`);

/** `/announcements/:id`. */
export const announcementIdParamSchema = z.object({ id: positiveId('announcement id') });

export const ANNOUNCEMENT_TITLE_MAX = 200;
export const ANNOUNCEMENT_CONTENT_MAX = 10_000;

const title = z
  .string('Title is required.')
  .trim()
  .min(1, 'Title is required.')
  .max(ANNOUNCEMENT_TITLE_MAX, `Title must be at most ${ANNOUNCEMENT_TITLE_MAX} characters.`);
const content = z
  .string('Write the announcement.')
  .trim()
  .min(1, 'Write the announcement.')
  .max(
    ANNOUNCEMENT_CONTENT_MAX,
    `The announcement must be at most ${ANNOUNCEMENT_CONTENT_MAX.toLocaleString('en')} characters.`,
  );

export const SCOPE_REQUIRED = 'Choose a club or a department.';
export const SCOPE_EXCLUSIVE = 'Choose a club or a department, not both.';

/**
 * POST /api/v1/announcements (FR-ANNOUNCE-001). Exactly one scope (D38, confirmed
 * 2026-11-14): a club post has no department, so club-only visibility never mixes with
 * department-wide visibility. `is_pinned` is for dept_admin and super_admin only; the service
 * refuses it from a moderator.
 */
export const createAnnouncementSchema = z
  .object({
    title,
    content,
    club_id: positiveId('club id').optional(),
    department_id: positiveId('department id').optional(),
    is_pinned: z.boolean('Pinned must be true or false.').optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const scopes = Number(v.club_id !== undefined) + Number(v.department_id !== undefined);
    if (scopes === 0) ctx.addIssue({ code: 'custom', message: SCOPE_REQUIRED, path: ['club_id'] });
    if (scopes === 2) {
      ctx.addIssue({ code: 'custom', message: SCOPE_EXCLUSIVE, path: ['club_id'] });
    }
  });

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type CreateAnnouncementBody = z.input<typeof createAnnouncementSchema>;

/** PATCH /api/v1/announcements/:id (FR-ANNOUNCE-003). The scope never changes. */
export const updateAnnouncementSchema = z
  .object({ title, content })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send a title or content to update.');

export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
export type UpdateAnnouncementBody = z.input<typeof updateAnnouncementSchema>;

/** GET /api/v1/announcements (FR-ANNOUNCE-002). Filters narrow the caller's visible feed. */
export const announcementListQuerySchema = z
  .object({
    ...paginationQueryShape,
    club_id: positiveId('club id').optional(),
    department_id: positiveId('department id').optional(),
    is_pinned: z
      .enum(['true', 'false'], 'is_pinned must be true or false.')
      .transform((v) => v === 'true')
      .optional(),
  })
  .strict();

export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>;
export type AnnouncementListParams = z.input<typeof announcementListQuerySchema>;

export const ANNOUNCEMENT_SCOPES = ['club', 'department'] as const;
export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

const ref = z.object({ id: z.number().int().positive(), name: z.string() });

/** One announcement as the API returns it. The author's email is never included. */
export const announcementSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  content: z.string(),
  is_pinned: z.boolean(),
  scope: z.enum(ANNOUNCEMENT_SCOPES),
  club: ref.nullable(),
  department: ref.nullable(),
  author: ref.extend({ id: z.string() }),
  created_at: z.string(),
  updated_at: z.string(),
  /** The caller may edit and delete it. */
  can_manage: z.boolean(),
  /** The caller may pin and unpin it. */
  can_pin: z.boolean(),
});

export type Announcement = z.infer<typeof announcementSchema>;
