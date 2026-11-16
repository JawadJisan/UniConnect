import type { ChatbotAnswer } from '@uniconnect/shared';
import { createHash } from 'node:crypto';
import { toDbDate, type IsoDate } from '../../lib/dates.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';
import type { Db } from '../../repositories/audit.repository.js';
import { normalizeQuestion } from './chatbot.prompt.js';

// The answer cache (PRD FR-AI-001: 5 minutes; DECISIONS D44). Two people share a cached
// answer only when retrieval would give them the same records, so the key holds every fact
// the visibility rules read: the role class, the department, the clubs with an active
// membership, the clubs with a current committee seat, and the Dhaka day (memberships end on
// a date). The PRD's `<department_id>:<visibility_scope>` key would let a member of one club
// share an answer with a non-member, so it isn't used (D44, issue 15).
//
// Cache errors are logged and ignored: the cache saves Gemini calls but is never required.

export const CACHE_TTL_SECONDS = 300;

export interface ScopeFacts {
  membershipClubIds: number[];
  seatClubIds: number[];
}

/** The two caller facts the rules read beyond the session. Two small indexed queries. */
export async function loadScopeFacts(db: Db, userId: string, today: IsoDate): Promise<ScopeFacts> {
  const [memberships, seats] = await Promise.all([
    db.clubMembership.findMany({
      where: { userId, status: 'active', endDate: { gte: toDbDate(today) } },
      select: { clubId: true },
    }),
    db.clubCommitteeMember.findMany({
      where: { userId, isCurrent: true },
      select: { clubId: true },
    }),
  ]);
  const sorted = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b);
  return {
    membershipClubIds: sorted(memberships.map((m) => m.clubId)),
    seatClubIds: sorted(seats.map((s) => s.clubId)),
  };
}

/** The roles the visibility rules tell apart; student and faculty read the same way. */
function roleClass(role: string): string {
  return role === 'super_admin' || role === 'dept_admin' || role === 'moderator' ? role : 'member';
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** A hash of everything that decides what the caller can retrieve. */
export function scopeHash(
  caller: { role: string; departmentId: number | null },
  facts: ScopeFacts,
  today: IsoDate,
): string {
  // A super admin sees everything, whoever they are.
  if (caller.role === 'super_admin') return sha256('super_admin');
  return sha256(
    JSON.stringify([
      roleClass(caller.role),
      caller.departmentId,
      facts.membershipClubIds,
      facts.seatClubIds,
      today,
    ]),
  );
}

export function cacheKey(scope: string, question: string): string {
  return `chatbot:v1:${scope}:${sha256(normalizeQuestion(question))}`;
}

export async function readCache(key: string): Promise<ChatbotAnswer | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as ChatbotAnswer) : null;
  } catch (err) {
    logger.warn(`chatbot cache read: ${(err as Error).message}`);
    return null;
  }
}

export async function writeCache(key: string, value: ChatbotAnswer): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn(`chatbot cache write: ${(err as Error).message}`);
  }
}
