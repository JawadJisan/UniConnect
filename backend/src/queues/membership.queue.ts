import { Queue } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';

/** Scheduled membership jobs (PRD §15). The worker is src/workers/membership.worker.ts. */
export const MEMBERSHIP_QUEUE = 'memberships';

export const MEMBERSHIP_JOBS = {
  /** Daily: expire ended memberships, then start due scheduled renewals. */
  EXPIRE: 'expire-memberships',
  /** Every 15 minutes: cancel unpaid checkouts older than 30 minutes. */
  CANCEL_STALE: 'cancel-stale-pending-memberships',
} as const;

export type MembershipJobName = (typeof MEMBERSHIP_JOBS)[keyof typeof MEMBERSHIP_JOBS];

let queue: Queue | undefined;

function getQueue(): Queue {
  if (queue) return queue;
  queue = new Queue(MEMBERSHIP_QUEUE, {
    connection: createRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  // Log the message only: a raw ioredis error can carry the AUTH password.
  queue.on('error', (err) => logger.error(`membership queue: ${err.message}`));
  return queue;
}

/**
 * Registers the repeatable jobs. Upserts are idempotent, so every API start may call this and
 * several instances still run each schedule once.
 */
export async function scheduleMembershipJobs(): Promise<void> {
  const q = getQueue();
  await q.upsertJobScheduler(
    MEMBERSHIP_JOBS.EXPIRE,
    { pattern: '5 0 * * *', tz: 'Asia/Dhaka' },
    { name: MEMBERSHIP_JOBS.EXPIRE },
  );
  await q.upsertJobScheduler(
    MEMBERSHIP_JOBS.CANCEL_STALE,
    { every: 15 * 60 * 1000 },
    { name: MEMBERSHIP_JOBS.CANCEL_STALE },
  );
}

export async function closeMembershipQueue(): Promise<void> {
  await queue?.close();
  queue = undefined;
}
