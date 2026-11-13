import { Worker } from 'bullmq';
import { logger } from '../lib/logger.js';
import { createRedis } from '../lib/redis.js';
import { fanOutEventEmails } from '../modules/events/event.notify.js';
import { eventService } from '../modules/events/event.service.js';
import {
  EVENT_JOBS,
  EVENT_QUEUE,
  NOTIFY_EVENT_JOB,
  type NotifyEventJob,
} from '../queues/event.queue.js';

/** Runs the event email fan-out and the daily reminder run on its own Redis connection. */
export function startEventWorker(): Worker<NotifyEventJob> {
  const worker = new Worker<NotifyEventJob>(
    EVENT_QUEUE,
    async (job) => {
      if (job.name === EVENT_JOBS.REMINDERS) {
        const events = await eventService.sendReminders();
        logger.info(`events: reminders queued for ${events} events`);
        return;
      }
      if (job.name !== NOTIFY_EVENT_JOB) {
        logger.warn(`event worker: unknown job ${job.name}`);
        return;
      }
      const queued = await fanOutEventEmails(job.data, (cursor) =>
        job.updateData({ ...job.data, cursor }),
      );
      logger.info(`events: ${queued} ${job.data.kind} emails queued for event ${job.data.eventId}`);
    },
    { connection: createRedis(), concurrency: 1 },
  );

  // Job data holds ids only, but log the message alone like every other worker.
  worker.on('failed', (job, err) => {
    logger.error(`event job ${job?.id} failed: ${err.message}`);
  });
  let lastError = '';
  worker.on('error', (err) => {
    if (err.message === lastError) return;
    lastError = err.message;
    logger.error(`event worker error: ${err.message}`);
  });
  return worker;
}
