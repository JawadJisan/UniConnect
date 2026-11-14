import { Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { requestService } from '../modules/blood/request.service.js';
import { BLOOD_JOBS, BLOOD_QUEUE } from '../queues/blood.queue.js';

/** Runs the blood-request expiry job on its own Redis connection, as BullMQ requires. */
export function startBloodWorker(): Worker {
  const worker = new Worker(
    BLOOD_QUEUE,
    async (job) => {
      if (job.name === BLOOD_JOBS.EXPIRE_REQUESTS) {
        const expired = await requestService.expireRequests();
        logger.info(`blood: ${expired} requests expired`);
        return;
      }
      logger.warn(`blood worker: unknown job ${job.name}`);
    },
    { connection: createRedis(), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error(`blood job ${job?.name} failed: ${err.message}`);
  });
  let lastError = '';
  worker.on('error', (err) => {
    if (err.message === lastError) return;
    lastError = err.message;
    logger.error(`blood worker error: ${err.message}`);
  });
  return worker;
}
