import { Worker } from 'bullmq';
import { resetPasswordTemplate, verifyEmailTemplate } from '../emails/templates.js';
import { logger } from '../lib/logger.js';
import { sendMail } from '../lib/mailer.js';
import { createRedis } from '../lib/redis.js';
import { EMAIL_QUEUE, type EmailJob } from '../queues/email.queue.js';

/** Starts the email worker on its own Redis connection, as BullMQ requires. */
export function startEmailWorker(): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(
    EMAIL_QUEUE,
    async (job) => {
      const { kind, to, name, url } = job.data;
      const mail =
        kind === 'verify-email'
          ? verifyEmailTemplate(to, name, url)
          : resetPasswordTemplate(to, name, url);
      await sendMail(mail);
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
