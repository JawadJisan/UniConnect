import { Queue } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';

export const EMAIL_QUEUE = 'email';

export type EmailJob =
  | { kind: 'verify-email'; to: string; name: string; url: string }
  | { kind: 'reset-password'; to: string; name: string; url: string }
  | {
      /** After a validated membership payment (PRD FR-MEM-001 step 3). */
      kind: 'membership-receipt';
      to: string;
      name: string;
      clubName: string;
      type: 'monthly' | 'yearly';
      /** `active`, or `scheduled` for an early renewal. */
      status: 'active' | 'scheduled';
      startDate: string;
      endDate: string;
      amount: string;
      currency: string;
      transactionId: string;
      url: string;
    }
  | {
      /** A super_admin assigned the user as department admin (PRD FR-ADMIN-001 step 5). */
      kind: 'dept-admin-assigned';
      to: string;
      name: string;
      departmentName: string;
      startDate: string;
      endDate: string;
      url: string;
    }
  | {
      /**
       * Event emails (PRD FR-EVENT-003, -005, -007; DECISIONS D36): a new event the reader may
       * attend, a cancellation for registrants, a registration confirmation, and the reminder
       * the day before (PRD §11 `event-reminders`).
       */
      kind: 'event-published' | 'event-cancelled' | 'event-registered' | 'event-reminder';
      to: string;
      name: string;
      title: string;
      clubName: string;
      /** ISO 8601 instant; the template shows it in Asia/Dhaka. */
      startDate: string;
      venue: string | null;
      url: string;
    };

let queue: Queue<EmailJob> | undefined;

// Created on first use, so importing the auth config (tests, scripts) opens no connection.
function getQueue(): Queue<EmailJob> {
  if (queue) return queue;
  queue = new Queue<EmailJob>(EMAIL_QUEUE, {
    connection: createRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      // Job data holds a token link, so don't keep it in Redis longer than needed.
      removeOnComplete: true,
      removeOnFail: { age: 24 * 60 * 60 },
    },
  });
  // Without a listener BullMQ console.errors the raw ioredis error, whose `command` can carry
  // the AUTH password. Log the message only.
  queue.on('error', (err) => logger.error(`email queue: ${err.message}`));
  return queue;
}

/**
 * `jobId` makes the add idempotent while the job is still in Redis: the event fan-out passes
 * one per recipient, so a retried page doesn't queue the same email twice.
 */
export async function enqueueEmail(job: EmailJob, opts: { jobId?: string } = {}): Promise<void> {
  try {
    await getQueue().add(job.kind, job, opts.jobId ? { jobId: opts.jobId } : undefined);
  } catch (err) {
    // ioredis errors carry the failed command, and for AUTH/HELLO that includes the Redis
    // password. Better Auth logs whatever this throws, so pass on only the message.
    // eslint-disable-next-line preserve-caught-error -- the cause holds the Redis password
    throw new Error(`email queue unavailable: ${(err as Error).message}`);
  }
}

export async function closeEmailQueue(): Promise<void> {
  await queue?.close();
  queue = undefined;
}
