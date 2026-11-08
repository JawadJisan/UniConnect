import { Queue } from 'bullmq';
import { createRedis } from '../lib/redis.js';

export const EMAIL_QUEUE = 'email';

export type EmailJob =
  | { kind: 'verify-email'; to: string; name: string; url: string }
  | { kind: 'reset-password'; to: string; name: string; url: string };

let queue: Queue<EmailJob> | undefined;

// Created on first use, so importing the auth config (tests, scripts) opens no connection.
function getQueue(): Queue<EmailJob> {
  queue ??= new Queue<EmailJob>(EMAIL_QUEUE, {
    connection: createRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      // Job data holds a token link, so don't keep it in Redis longer than needed.
      removeOnComplete: true,
      removeOnFail: { age: 24 * 60 * 60 },
    },
  });
  return queue;
}

export async function enqueueEmail(job: EmailJob): Promise<void> {
  try {
    await getQueue().add(job.kind, job);
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
