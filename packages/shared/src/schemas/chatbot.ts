import { z } from 'zod';
import { FROM_AFTER_TO } from './audit.js';
import { isoDateSchema } from './dept-admin-term.js';
import { roleSchema } from './enums.js';
import { paginationQueryShape } from './pagination.js';

// AI chatbot and event description generator (PRD FR-AI-001–003; DECISIONS D44).

/** PRD FR-AI-001's answer when the context doesn't hold one. Also used for an empty reply. */
export const FALLBACK_ANSWER =
  "I don't have information about that. Please contact your club moderator or department admin.";

export const CHATBOT_QUESTION_MAX = 500;

/** POST /api/v1/chatbot/ask. */
export const chatbotAskSchema = z
  .object({
    question: z
      .string('Type a question.')
      .trim()
      .min(1, 'Type a question.')
      .max(CHATBOT_QUESTION_MAX, `Questions are at most ${CHATBOT_QUESTION_MAX} characters.`),
  })
  .strict();

export type ChatbotAskInput = z.infer<typeof chatbotAskSchema>;

export const CHAT_SOURCE_TYPES = ['event', 'announcement', 'club'] as const;
export type ChatSourceType = (typeof CHAT_SOURCE_TYPES)[number];

/** A record the answer was drawn from; every one is something the caller may open. */
export interface ChatSource {
  type: ChatSourceType;
  id: number;
}

export interface ChatbotAnswer {
  answer: string;
  sources: ChatSource[];
}

/**
 * GET /api/v1/admin/chatbot/logs. `from` and `to` are inclusive Asia/Dhaka days, as in the
 * audit log viewer. `search` matches the question, case-insensitively.
 */
export const chatLogQuerySchema = z
  .object({
    ...paginationQueryShape,
    user_id: z.uuid('Not a valid user id.').optional(),
    search: z.string().trim().min(1).max(100, 'Search is at most 100 characters.').optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: FROM_AFTER_TO, path: ['from'] });

export type ChatLogQuery = z.infer<typeof chatLogQuerySchema>;
export type ChatLogParams = z.input<typeof chatLogQuerySchema>;

/** One logged question. The asker is name and role only, never email. */
export interface ChatLogEntry {
  id: number;
  question: string;
  answer: string;
  created_at: string;
  user: { id: string; name: string; role: z.infer<typeof roleSchema> };
}

/** POST /api/v1/ai/generate-event-description (FR-AI-003). */
export const generateEventDescriptionSchema = z
  .object({
    title: z.string('Give the event a title.').trim().min(1, 'Give the event a title.').max(200),
    club_name: z.string('Name the club.').trim().min(1, 'Name the club.').max(150),
    date: z.union([isoDateSchema, z.iso.datetime({ offset: true })], 'Use a date or date-time.'),
    venue: z.string('Name the venue.').trim().min(1, 'Name the venue.').max(200),
  })
  .strict();

export type GenerateEventDescriptionInput = z.infer<typeof generateEventDescriptionSchema>;

export interface EventDescriptionDraft {
  description: string;
}
