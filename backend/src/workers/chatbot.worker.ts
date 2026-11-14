import { Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { chatbotService } from '../modules/chatbot/chatbot.service.js';
import { CHATBOT_JOBS, CHATBOT_QUEUE } from '../queues/chatbot.queue.js';

/** Runs the ChatLog purge on its own Redis connection, as BullMQ requires. */
export function startChatbotWorker(): Worker {
  const worker = new Worker(
    CHATBOT_QUEUE,
    async (job) => {
      if (job.name === CHATBOT_JOBS.PURGE_LOGS) {
        const purged = await chatbotService.purgeOldLogs();
        logger.info(`chatbot: ${purged} chat logs purged`);
        return;
      }
      logger.warn(`chatbot worker: unknown job ${job.name}`);
    },
    { connection: createRedis(), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error(`chatbot job ${job?.name} failed: ${err.message}`);
  });
  let lastError = '';
  worker.on('error', (err) => {
    if (err.message === lastError) return;
    lastError = err.message;
    logger.error(`chatbot worker error: ${err.message}`);
  });
  return worker;
}
