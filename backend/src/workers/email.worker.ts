import { Worker } from 'bullmq';
import {
  deptAdminAssignedTemplate,
  eventTemplate,
  membershipReceiptTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from '../emails/templates.js';
import { logger } from '../lib/logger.js';
import { sendMail } from '../lib/mailer.js';
import { createRedis } from '../lib/redis.js';
import { EMAIL_QUEUE, type EmailJob } from '../queues/email.queue.js';

/** Starts the email worker on its own Redis connection, as BullMQ requires. */
export function startEmailWorker(): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(
    EMAIL_QUEUE,
    async (job) => {
      const data = job.data;
      switch (data.kind) {
        case 'verify-email':
          return sendMail(verifyEmailTemplate(data.to, data.name, data.url));
        case 'reset-password':
          return sendMail(resetPasswordTemplate(data.to, data.name, data.url));
        case 'membership-receipt':
          return sendMail(membershipReceiptTemplate(data));
        case 'dept-admin-assigned':
          return sendMail(deptAdminAssignedTemplate(data));
        case 'event-published':
        case 'event-cancelled':
        case 'event-registered':
          return sendMail(eventTemplate(data));
      }
    },
    { connection: createRedis(), concurrency: 5 },
  );

  // Never log job data: it contains the token link.
  worker.on('failed', (job, err) => {
    logger.error(`email job ${job?.id} (${job?.name}) failed: ${err.message}`);
  });
  // Connection errors repeat on every retry; log each distinct one once.
  let lastError = '';
  worker.on('error', (err) => {
    if (err.message === lastError) return;
    lastError = err.message;
    logger.error(`email worker error: ${err.message}`);
  });
  return worker;
}
