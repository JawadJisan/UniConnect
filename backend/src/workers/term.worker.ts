import { Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { committeeService } from '../modules/committee/committee.service.js';
import { deptAdminTermService } from '../modules/dept-admin-terms/dept-admin-term.service.js';
import { TERM_JOBS, TERM_QUEUE } from '../queues/term.queue.js';

/** Runs the term-expiry jobs on its own Redis connection, as BullMQ requires. */
export function startTermWorker(): Worker {
  const worker = new Worker(
    TERM_QUEUE,
    async (job) => {
      switch (job.name) {
        case TERM_JOBS.EXPIRE_DEPT_ADMIN: {
          const ended = await deptAdminTermService.expireTerms();
          logger.info(`terms: ${ended} dept admin terms expired`);
          return;
        }
        case TERM_JOBS.EXPIRE_COMMITTEE: {
          const ended = await committeeService.expireTerms();
          logger.info(`terms: ${ended} committee terms expired`);
          return;
        }
        default:
          logger.warn(`term worker: unknown job ${job.name}`);
      }
    },
    // One at a time: both jobs lock user rows and gain nothing from running in parallel.
    { connection: createRedis(), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error(`term job ${job?.name} failed: ${err.message}`);
  });
  let lastError = '';
  worker.on('error', (err) => {
    if (err.message === lastError) return;
    lastError = err.message;
    logger.error(`term worker error: ${err.message}`);
  });
  return worker;
}
