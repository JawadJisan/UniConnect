import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { closeQueueHealth } from './lib/queue-health.js';
import { redis } from './lib/redis.js';
import { closeBloodQueue, scheduleBloodJobs } from './queues/blood.queue.js';
import { closeEmailQueue } from './queues/email.queue.js';
import { closeEventQueue, scheduleEventJobs } from './queues/event.queue.js';
import { closeMembershipQueue, scheduleMembershipJobs } from './queues/membership.queue.js';
import { closeTermQueue, scheduleTermJobs } from './queues/term.queue.js';
import { startBloodWorker } from './workers/blood.worker.js';
import { startEmailWorker } from './workers/email.worker.js';
import { startEventWorker } from './workers/event.worker.js';
import { startMembershipWorker } from './workers/membership.worker.js';
import { startTermWorker } from './workers/term.worker.js';

// V1 runs the workers in the API process. Move them to their own process when load needs it.
const emailWorker = startEmailWorker();
const membershipWorker = startMembershipWorker();
scheduleMembershipJobs().catch((err: Error) => {
  logger.error(`membership job schedules not registered: ${err.message}`);
});
const termWorker = startTermWorker();
scheduleTermJobs().catch((err: Error) => {
  logger.error(`term job schedules not registered: ${err.message}`);
});
const eventWorker = startEventWorker();
scheduleEventJobs().catch((err: Error) => {
  logger.error(`event job schedules not registered: ${err.message}`);
});
const bloodWorker = startBloodWorker();
scheduleBloodJobs().catch((err: Error) => {
  logger.error(`blood job schedules not registered: ${err.message}`);
});

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  server.close();
  // Let the worker finish its current job before the connections close.
  await Promise.allSettled([
    emailWorker.close(),
    membershipWorker.close(),
    termWorker.close(),
    eventWorker.close(),
    bloodWorker.close(),
    closeEmailQueue(),
    closeMembershipQueue(),
    closeTermQueue(),
    closeEventQueue(),
    closeBloodQueue(),
    closeQueueHealth(),
  ]);
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
