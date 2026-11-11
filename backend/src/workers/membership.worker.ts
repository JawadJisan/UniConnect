import { Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { membershipService } from '../modules/memberships/membership.service.js';
import { MEMBERSHIP_JOBS, MEMBERSHIP_QUEUE } from '../queues/membership.queue.js';

/** Runs the scheduled membership jobs on its own Redis connection, as BullMQ requires. */
export function startMembershipWorker(): Worker {
  const worker = new Worker(
    MEMBERSHIP_QUEUE,
    async (job) => {
      switch (job.name) {
        case MEMBERSHIP_JOBS.EXPIRE: {
          const { expired, activated } = await membershipService.expireAndActivate();
          logger.info(`memberships: ${expired} expired, ${activated} scheduled renewals started`);
          return;
        }
        case MEMBERSHIP_JOBS.CANCEL_STALE: {
          const cancelled = await membershipService.cancelStale();
          if (cancelled > 0) logger.info(`memberships: ${cancelled} stale checkouts cancelled`);
          return;
        }
        default:
          logger.warn(`membership worker: unknown job ${job.name}`);
      }
    },
    // One at a time: the jobs lock rows in batches and gain nothing from running in parallel.
    { connection: createRedis(), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error(`membership job ${job?.name} failed: ${err.message}`);
  });
  let lastError = '';
  worker.on('error', (err) => {
    if (err.message === lastError) return;
    lastError = err.message;
    logger.error(`membership worker error: ${err.message}`);
  });
  return worker;
}
