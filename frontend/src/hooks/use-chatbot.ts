'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type {
  ChatbotAnswer,
  ChatLogEntry,
  ChatLogParams,
  EventDescriptionDraft,
  GenerateEventDescriptionInput,
  Paginated,
} from '@uniconnect/shared';
import { api } from '@/lib/api';
import { toAiError } from '@/lib/chatbot';

// The AI routes (PRD FR-AI-001–003; DECISIONS D44, D45). Ask and draft share one 10-a-minute
// limit per user on the server; neither is cached here.

export const CHAT_LOGS_KEY = ['chatbot-logs'] as const;

interface Envelope<T> {
  data: T;
}

interface ListEnvelope<T> {
  data: T[];
  meta: Paginated<T>['meta'];
}

// 400 (a bad filter) and 403 won't change on retry.
const retryServerErrors = (count: number, err: unknown) =>
  ((err as { status?: number }).status ?? 0) >= 500 && count < 1;

/** POST /chatbot/ask (FR-AI-001), any signed-in user. */
export function useAskChatbot() {
  return useMutation({
    mutationFn: async (question: string): Promise<ChatbotAnswer> => {
      try {
        const res = await api.post<Envelope<ChatbotAnswer>>('/v1/chatbot/ask', { question });
        return res.data.data;
      } catch (err) {
        throw toAiError(err);
      }
    },
  });
}

/** GET /admin/chatbot/logs (FR-AI-002), super admin only. */
export function useChatLogs(params: ChatLogParams, { enabled = true } = {}) {
  return useQuery({
    queryKey: [...CHAT_LOGS_KEY, params],
    queryFn: async (): Promise<Paginated<ChatLogEntry>> => {
      try {
        const res = await api.get<ListEnvelope<ChatLogEntry>>('/v1/admin/chatbot/logs', {
          params,
        });
        return { data: res.data.data, meta: res.data.meta };
      } catch (err) {
        throw toAiError(err);
      }
    },
    enabled,
    placeholderData: keepPreviousData,
    retry: retryServerErrors,
  });
}

/** POST /ai/generate-event-description (FR-AI-003), organizers only. */
export function useGenerateEventDescription() {
  return useMutation({
    mutationFn: async (input: GenerateEventDescriptionInput): Promise<string> => {
      try {
        const res = await api.post<Envelope<EventDescriptionDraft>>(
          '/v1/ai/generate-event-description',
          input,
        );
        return res.data.data.description;
      } catch (err) {
        throw toAiError(err);
      }
    },
  });
}
