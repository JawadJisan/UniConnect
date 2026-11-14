import type { QueueHealth } from '@uniconnect/shared';
import { Queue } from 'bullmq';
import { logger } from './logger.js';
import { createRedis } from './redis.js';

// Queue health for the super admin dashboard (PRD FR-DASH-004 "including queue health";
// DECISIONS D42). Read-only Queue handles, created once and kept, one connection shared by
// all of them. Each count has its own timeout, so a Redis outage shows as `unavailable`
// rather than failing the dashboard.

/** Every BullMQ queue the API runs (src/queues/). */
export const QUEUE_NAMES = ['email', 'memberships', 'terms', 'events', 'blood'] as const;

const COUNT_TIMEOUT_MS = 3000;

let queues: Map<string, Queue> | undefined;

function handles(): Map<string, Queue> {
  if (queues) return queues;
  const connection = createRedis();
  queues = new Map(QUEUE_NAMES.map((name) => [name, new Queue(name, { connection })]));
  // Log the message only: a raw ioredis error can carry the AUTH password.
  for (const q of queues.values())
    q.on('error', (err) => logger.error(`queue health: ${err.message}`));
  return queues;
}

async function countsFor(name: string): Promise<QueueHealth> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const queue = handles().get(name)!;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), COUNT_TIMEOUT_MS);
    });
    const c = await Promise.race([
      queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
      timeout,
    ]);
    return {
      name,
      state: 'ok',
      counts: {
        waiting: c.waiting ?? 0,
        active: c.active ?? 0,
        delayed: c.delayed ?? 0,
        failed: c.failed ?? 0,
      },
    };
  } catch {
    return { name, state: 'unavailable', counts: null };
  } finally {
    clearTimeout(timer);
  }
}

export function queueHealth(): Promise<QueueHealth[]> {
  return Promise.all(QUEUE_NAMES.map(countsFor));
}

export async function closeQueueHealth(): Promise<void> {
  if (!queues) return;
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues = undefined;
}
