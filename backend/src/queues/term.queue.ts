import { Queue } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';

/** Daily term-expiry jobs (PRD FR-ADMIN-005). The worker is src/workers/term.worker.ts. */
export const TERM_QUEUE = 'terms';

export const TERM_JOBS = {
  /** Daily: end dept admin terms whose end_date is before today (Asia/Dhaka). */
  EXPIRE_DEPT_ADMIN: 'expire-dept-admin-terms',
  /** Daily: end committee terms whose term_end_year is before the current year (Asia/Dhaka). */
  EXPIRE_COMMITTEE: 'expire-committee-terms',
} as const;

export type TermJobName = (typeof TERM_JOBS)[keyof typeof TERM_JOBS];

let queue: Queue | undefined;

function getQueue(): Queue {
  if (queue) return queue;
  queue = new Queue(TERM_QUEUE, {
    connection: createRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  // Log the message only: a raw ioredis error can carry the AUTH password.
  queue.on('error', (err) => logger.error(`term queue: ${err.message}`));
  return queue;
}

/** Registers both daily schedules at 00:05 Asia/Dhaka. Upserts are idempotent. */
export async function scheduleTermJobs(): Promise<void> {
  const q = getQueue();
  for (const name of [TERM_JOBS.EXPIRE_DEPT_ADMIN, TERM_JOBS.EXPIRE_COMMITTEE]) {
    await q.upsertJobScheduler(name, { pattern: '5 0 * * *', tz: 'Asia/Dhaka' }, { name });
  }
}

export async function closeTermQueue(): Promise<void> {
  await queue?.close();
  queue = undefined;
}
