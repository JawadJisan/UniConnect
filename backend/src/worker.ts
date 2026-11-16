import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { closeBloodQueue } from './queues/blood.queue.js';
import { closeChatbotQueue } from './queues/chatbot.queue.js';
import { closeEmailQueue } from './queues/email.queue.js';
import { closeEventQueue } from './queues/event.queue.js';
import { closeMembershipQueue } from './queues/membership.queue.js';
import { closeTermQueue } from './queues/term.queue.js';
import { startWorkers } from './workers/index.js';

// The worker process (PRD §3: "API process and BullMQ worker process run separately"; DECISIONS
// D46): every BullMQ worker and the daily schedules, no HTTP. `pnpm start:worker` in production,
// with RUN_WORKERS_IN_API=false on the API so the jobs run in exactly one place.

const stopWorkers = startWorkers();
logger.info('workers started');

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, stopping workers`);
  await stopWorkers();
  // Workers enqueue follow-up jobs (an event's emails), so their queues close too.
  await Promise.allSettled([
    closeEmailQueue(),
    closeMembershipQueue(),
    closeTermQueue(),
    closeEventQueue(),
    closeBloodQueue(),
    closeChatbotQueue(),
  ]);
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
