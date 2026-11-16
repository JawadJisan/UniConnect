import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';

// ChatLog rows (PRD FR-AI-002; DECISIONS D44). The asker is read as name and role only.

const CHAT_LOG_SELECT = {
  id: true,
  question: true,
  answer: true,
  createdAt: true,
  user: { select: { id: true, name: true, role: true } },
} satisfies Prisma.ChatLogSelect;

export type ChatLogRow = Prisma.ChatLogGetPayload<{ select: typeof CHAT_LOG_SELECT }>;

export const chatLogRepository = {
  create(db: Db, data: { userId: string; question: string; answer: string }) {
    return db.chatLog.create({ data, select: { id: true } });
  },

  async list(db: Db, where: Prisma.ChatLogWhereInput, page: number, limit: number) {
    const [rows, total] = await Promise.all([
      db.chatLog.findMany({
        where,
        select: CHAT_LOG_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.chatLog.count({ where }),
    ]);
    return { rows, total };
  },

  /** Retention (PRD #18: 90 days). Deletes one batch older than `before`; returns the count. */
  async purgeBatch(db: Db, before: Date, batch: number): Promise<number> {
    return db.$executeRaw`
      DELETE FROM chat_logs WHERE id IN (
        SELECT id FROM chat_logs WHERE created_at < ${before} ORDER BY id LIMIT ${batch})`;
  },
};
