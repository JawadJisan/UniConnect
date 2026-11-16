import type { WorkerOptions } from 'bullmq';
import { env } from '../config/env.js';
import { createRedis } from '../lib/redis.js';

/**
 * How long (seconds) an idle worker blocks waiting for a job before it polls again. A new job
 * still wakes it at once, so a longer wait only cuts idle Redis commands. Production uses 30 s
 * to keep a small hosted Redis (Render Free Key Value, Upstash free) well inside its limits;
 * elsewhere it stays at BullMQ's default of 5 s (DECISIONS D48).
 */
export function drainDelayFor(nodeEnv: string): number {
  return nodeEnv === 'production' ? 30 : 5;
}

/** Options for one BullMQ worker, on its own Redis connection as BullMQ requires. */
export function workerOptions(concurrency: number): WorkerOptions {
  return { connection: createRedis(), concurrency, drainDelay: drainDelayFor(env.NODE_ENV) };
}
