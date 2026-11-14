import { isAxiosError } from 'axios';
import type { ChatLogParams, ChatSource } from '@uniconnect/shared';
import { ApiError, toApiError } from './api';

// The AI assistant, chat log viewer and event description draft (PRD FR-AI-001–003;
// DECISIONS D44, D45).

/** An API error from an AI route. A 429 carries the seconds from `Retry-After`. */
export type AiError = ApiError & { retryAfter?: number };

/** Like `toApiError`, keeping the `Retry-After` seconds of a 429 for the countdown. */
export function toAiError(err: unknown): AiError {
  const apiError: AiError = toApiError(err);
  if (apiError.status === 429 && isAxiosError(err)) {
    const header = Number(err.response?.headers?.['retry-after']);
    if (Number.isFinite(header) && header > 0) apiError.retryAfter = Math.ceil(header);
  }
  return apiError;
}

/** One sentence for each way an AI request can fail. */
export function aiErrorMessage(err: AiError, secondsLeft = err.retryAfter): string {
  if (err.status === 429) {
    return secondsLeft
      ? `You've reached the limit of 10 AI requests a minute. Try again in ${secondsLeft} s.`
      : "You've reached the limit of 10 AI requests a minute. Try again shortly.";
  }
  if (err.code === 'AI_NOT_CONFIGURED') return "The assistant isn't set up on this server.";
  if (err.code === 'AI_UNAVAILABLE' || err.status === 503) {
    return 'The assistant is unavailable right now. Try again shortly.';
  }
  if (err.status === 400) return err.fields[0]?.message ?? err.message;
  return err.message;
}

/** The record a source points to. Announcements have no page of their own. */
export function sourceHref(source: ChatSource): string {
  switch (source.type) {
    case 'event':
      return `/dashboard/events/${source.id}`;
    case 'club':
      return `/dashboard/clubs/${source.id}`;
    case 'announcement':
      return '/dashboard/announcements';
  }
}

/** "EVENT #12", for the source badges under an answer. */
export function sourceLabel(source: ChatSource): string {
  return `${source.type.toUpperCase()} #${source.id}`;
}

/** Clickable openers, shown while the thread is empty. */
export const STARTER_PROMPTS = [
  'What events are coming up?',
  "How much is my club's membership fee?",
  'What are the latest announcements?',
] as const;

/** The thread keeps this many messages; older ones drop off the top. */
export const THREAD_LIMIT = 20;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CHAT_LOG_FILTER_KEYS = ['user_id', 'search', 'from', 'to'] as const;

/** Reads the chat log viewer's params from the URL, keeping only values the API accepts. */
export function chatLogParamsFromUrl(search: URLSearchParams): ChatLogParams {
  const params: ChatLogParams = {};
  const user = search.get('user_id');
  if (user && UUID.test(user)) params.user_id = user;
  const text = search.get('search')?.trim();
  if (text && text.length <= 100) params.search = text;
  const from = search.get('from');
  if (from && ISO_DAY.test(from)) params.from = from;
  const to = search.get('to');
  if (to && ISO_DAY.test(to)) params.to = to;
  const page = Number(search.get('page'));
  if (Number.isInteger(page) && page > 1) params.page = page;
  return params;
}
