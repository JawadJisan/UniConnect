import { Queue } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';

/**
 * Event email fan-out (PRD FR-EVENT-003, -005; DECISIONS D36). One job per published or
 * cancelled event; the worker (src/workers/event.worker.ts) pages through the recipients and
 * queues one email each.
 */
export const EVENT_QUEUE = 'events';
export const NOTIFY_EVENT_JOB = 'notify-event';

/** Repeatable jobs on the same queue (PRD §11). */
export const EVENT_JOBS = {
  /** Daily 18:00 Asia/Dhaka: remind registrants of events starting in the next 24 hours. */
  REMINDERS: 'event-reminders',
} as const;

export interface NotifyEventJob {
  eventId: number;
  kind: 'published' | 'cancelled' | 'reminder';
  /** The last user id handled. Saved after each page, so a retry resumes after it. */
  cursor?: string | null;
}

let queue: Queue<NotifyEventJob> | undefined;

function getQueue(): Queue<NotifyEventJob> {
  if (queue) return queue;
  queue = new Queue<NotifyEventJob>(EVENT_QUEUE, {
    connection: createRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  // Log the message only: a raw ioredis error can carry the AUTH password.
  queue.on('error', (err) => logger.error(`event queue: ${err.message}`));
  return queue;
}

/**
 * Queues the fan-out. The job id is fixed per event and kind, so a second publish or cancel
 * request (which the state checks refuse anyway) can't queue it twice.
 */
export async function queueEventNotification(
  eventId: number,
  kind: NotifyEventJob['kind'],
): Promise<void> {
  try {
    await getQueue().add(
      NOTIFY_EVENT_JOB,
      { eventId, kind, cursor: null },
      { jobId: `notify-${eventId}-${kind}` },
    );
  } catch (err) {
    // eslint-disable-next-line preserve-caught-error -- the cause can hold the Redis password
    throw new Error(`event queue unavailable: ${(err as Error).message}`);
  }
}

/**
 * Registers the daily reminder run. 18:00 Dhaka, so the `(now, now + 24h]` windows of
 * consecutive runs don't overlap and nearly every event in one starts "tomorrow" (DECISIONS
 * D36). Upserting is idempotent.
 */
export async function scheduleEventJobs(): Promise<void> {
  await getQueue().upsertJobScheduler(
    EVENT_JOBS.REMINDERS,
    { pattern: '0 18 * * *', tz: 'Asia/Dhaka' },
    { name: EVENT_JOBS.REMINDERS },
  );
}

export async function closeEventQueue(): Promise<void> {
  await queue?.close();
  queue = undefined;
}
