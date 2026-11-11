import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { closeEmailQueue } from './queues/email.queue.js';
import { closeMembershipQueue, scheduleMembershipJobs } from './queues/membership.queue.js';
import { startEmailWorker } from './workers/email.worker.js';
import { startMembershipWorker } from './workers/membership.worker.js';

// V1 runs the workers in the API process. Move them to their own process when load needs it.
const emailWorker = startEmailWorker();
const membershipWorker = startMembershipWorker();
scheduleMembershipJobs().catch((err: Error) => {
  logger.error(`membership job schedules not registered: ${err.message}`);
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
    closeEmailQueue(),
    closeMembershipQueue(),
  ]);
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
