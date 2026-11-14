import {
  FALLBACK_ANSWER,
  paginationMeta,
  type ChatbotAnswer,
  type ChatLogEntry,
  type ChatLogQuery,
  type Paginated,
  type Role,
} from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { todayInDhaka } from '../../lib/dates.js';
import { aiConfigured, generateText } from '../../lib/gemini.js';
import { AppError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { createdAtRange } from '../audit-logs/audit-log.service.js';
import type { EventCaller } from '../events/event.access.js';
import { chatLogRepository, type ChatLogRow } from './chat-log.repository.js';
import { cacheKey, loadScopeFacts, readCache, scopeHash, writeCache } from './chatbot.cache.js';
import { CHATBOT_SYSTEM, chatbotPrompt, stripPii } from './chatbot.prompt.js';
import { retrieve } from './chatbot.retrieval.js';

// FR-AI-001 and FR-AI-002 (DECISIONS D44).

/** ChatLog retention (PRD #18). */
export const CHAT_LOG_RETENTION_DAYS = 90;
const PURGE_BATCH = 5000;

export const notConfigured = () =>
  new AppError(503, 'AI_NOT_CONFIGURED', 'The assistant is not set up on this server.');
export const unavailable = () =>
  new AppError(503, 'AI_UNAVAILABLE', 'The assistant is unavailable. Try again shortly.');

export function toChatLogEntry(row: ChatLogRow): ChatLogEntry {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    created_at: row.createdAt.toISOString(),
    user: { id: row.user.id, name: row.user.name, role: row.user.role as Role },
  };
}

export function whereChatLogs(q: ChatLogQuery): Prisma.ChatLogWhereInput {
  const createdAt = createdAtRange(q.from, q.to);
  return {
    ...(q.user_id !== undefined ? { userId: q.user_id } : {}),
    ...(q.search !== undefined ? { question: { contains: q.search, mode: 'insensitive' } } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

export const chatbotService = {
  /**
   * Visibility-scoped retrieval, then Gemini, cached per scope for 5 minutes. Every answered
   * ask, cache hits included, writes one ChatLog row holding the PII-stripped question.
   */
  async ask(caller: EventCaller, question: string): Promise<ChatbotAnswer> {
    if (!aiConfigured()) throw notConfigured();
    const today = todayInDhaka();
    const facts = await loadScopeFacts(prisma, caller.id, today);
    const key = cacheKey(scopeHash(caller, facts, today), question);

    let result = await readCache(key);
    if (!result) {
      const records = await retrieve(caller, question, today);
      let text: string;
      try {
        text = await generateText({
          system: CHATBOT_SYSTEM,
          prompt: chatbotPrompt(records, question),
          maxOutputTokens: 400,
          temperature: 0.2,
        });
      } catch (err) {
        logger.error(`chatbot ask failed: ${(err as Error).message}`);
        throw unavailable();
      }
      const answer = text || FALLBACK_ANSWER;
      result = {
        answer,
        sources: answer === FALLBACK_ANSWER ? [] : records.map((r) => ({ type: r.type, id: r.id })),
      };
      await writeCache(key, result);
    }

    await chatLogRepository.create(prisma, {
      userId: caller.id,
      question: stripPii(question),
      answer: result.answer,
    });
    return result;
  },

  /** GET /admin/chatbot/logs: newest first, the asker as name and role only. */
  async logs(q: ChatLogQuery): Promise<Paginated<ChatLogEntry>> {
    const { rows, total } = await chatLogRepository.list(prisma, whereChatLogs(q), q.page, q.limit);
    return { data: rows.map(toChatLogEntry), meta: paginationMeta(q.page, q.limit, total) };
  },

  /** The daily purge-chat-logs job: rows older than 90 days, in batches. Returns the count. */
  async purgeOldLogs(now: Date = new Date()): Promise<number> {
    const before = new Date(now.getTime() - CHAT_LOG_RETENTION_DAYS * 86_400_000);
    let total = 0;
    for (;;) {
      const deleted = await chatLogRepository.purgeBatch(prisma, before, PURGE_BATCH);
      total += deleted;
      if (deleted < PURGE_BATCH) return total;
    }
  },
};
