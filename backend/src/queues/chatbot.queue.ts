import { Queue } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';

/** ChatLog retention (PRD FR-AI-002, #18: 90 days). The worker is src/workers/chatbot.worker.ts. */
export const CHATBOT_QUEUE = 'chatbot';

export const CHATBOT_JOBS = {
  /** Daily: deletes chat_logs rows older than 90 days. */
  PURGE_LOGS: 'purge-chat-logs',
} as const;

let queue: Queue | undefined;

function getQueue(): Queue {
  if (queue) return queue;
  queue = new Queue(CHATBOT_QUEUE, {
    connection: createRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  // Log the message only: a raw ioredis error can carry the AUTH password.
  queue.on('error', (err) => logger.error(`chatbot queue: ${err.message}`));
  return queue;
}

/** Registers the daily purge at 03:30 Asia/Dhaka, a quiet hour. The upsert is idempotent. */
export async function scheduleChatbotJobs(): Promise<void> {
  const name = CHATBOT_JOBS.PURGE_LOGS;
  await getQueue().upsertJobScheduler(name, { pattern: '30 3 * * *', tz: 'Asia/Dhaka' }, { name });
}

export async function closeChatbotQueue(): Promise<void> {
  await queue?.close();
  queue = undefined;
}
