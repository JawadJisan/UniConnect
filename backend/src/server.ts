import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { closeEmailQueue } from './queues/email.queue.js';
import { startEmailWorker } from './workers/email.worker.js';

// V1 runs the email worker in the API process. Move it to its own process when load needs it.
const emailWorker = startEmailWorker();

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
  await Promise.allSettled([emailWorker.close(), closeEmailQueue()]);
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
