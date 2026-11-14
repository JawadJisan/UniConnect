import { Queue } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';

/** Daily blood-request expiry (PRD FR-BLOOD-009). The worker is src/workers/blood.worker.ts. */
export const BLOOD_QUEUE = 'blood';

export const BLOOD_JOBS = {
  /** Daily: pending requests whose required_by_date is before today (Asia/Dhaka) expire. */
  EXPIRE_REQUESTS: 'expire-blood-requests',
} as const;

let queue: Queue | undefined;

function getQueue(): Queue {
  if (queue) return queue;
  queue = new Queue(BLOOD_QUEUE, {
    connection: createRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  // Log the message only: a raw ioredis error can carry the AUTH password.
  queue.on('error', (err) => logger.error(`blood queue: ${err.message}`));
  return queue;
}

/** Registers the daily schedule at 00:05 Asia/Dhaka (PRD §11). The upsert is idempotent. */
export async function scheduleBloodJobs(): Promise<void> {
  const name = BLOOD_JOBS.EXPIRE_REQUESTS;
  await getQueue().upsertJobScheduler(name, { pattern: '5 0 * * *', tz: 'Asia/Dhaka' }, { name });
}

export async function closeBloodQueue(): Promise<void> {
  await queue?.close();
  queue = undefined;
}
