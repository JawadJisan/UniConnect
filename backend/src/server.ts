import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { closeQueueHealth } from './lib/queue-health.js';
import { redis } from './lib/redis.js';
import { closeBloodQueue } from './queues/blood.queue.js';
import { closeChatbotQueue } from './queues/chatbot.queue.js';
import { closeEmailQueue } from './queues/email.queue.js';
import { closeEventQueue } from './queues/event.queue.js';
import { closeMembershipQueue } from './queues/membership.queue.js';
import { closeTermQueue } from './queues/term.queue.js';
import { startWorkers } from './workers/index.js';

// The API process. In production the BullMQ workers run in their own process (src/worker.ts,
// PRD §3); elsewhere RUN_WORKERS_IN_API keeps one process for `pnpm dev` (DECISIONS D46).
const stopWorkers = env.RUN_WORKERS_IN_API ? startWorkers() : null;
if (!stopWorkers) logger.info('workers run in their own process (RUN_WORKERS_IN_API=false)');

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  server.close();
  await Promise.allSettled([
    stopWorkers?.(),
    // The API enqueues jobs whether or not it runs the workers.
    closeEmailQueue(),
    closeMembershipQueue(),
    closeTermQueue(),
    closeEventQueue(),
    closeBloodQueue(),
    closeChatbotQueue(),
    closeQueueHealth(),
  ]);
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
