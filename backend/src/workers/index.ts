import { logger } from '../lib/logger.js';
import { scheduleBloodJobs } from '../queues/blood.queue.js';
import { scheduleChatbotJobs } from '../queues/chatbot.queue.js';
import { scheduleEventJobs } from '../queues/event.queue.js';
import { scheduleMembershipJobs } from '../queues/membership.queue.js';
import { scheduleTermJobs } from '../queues/term.queue.js';
import { startBloodWorker } from './blood.worker.js';
import { startChatbotWorker } from './chatbot.worker.js';
import { startEmailWorker } from './email.worker.js';
import { startEventWorker } from './event.worker.js';
import { startMembershipWorker } from './membership.worker.js';
import { startTermWorker } from './term.worker.js';

// Every BullMQ worker and repeatable schedule (DECISIONS D46). Run by src/worker.ts (its own
// service in production, PRD §3) or inside the API when RUN_WORKERS_IN_API is true (the default
// outside production). Only one place should run them, so schedules are registered once.

const schedules: [string, () => Promise<unknown>][] = [
  ['membership', scheduleMembershipJobs],
  ['term', scheduleTermJobs],
  ['event', scheduleEventJobs],
  ['blood', scheduleBloodJobs],
  ['chatbot', scheduleChatbotJobs],
];

/** Starts the workers and registers the schedules; returns a function that closes them. */
export function startWorkers(): () => Promise<void> {
  const workers = [
    startEmailWorker(),
    startMembershipWorker(),
    startTermWorker(),
    startEventWorker(),
    startBloodWorker(),
    startChatbotWorker(),
  ];
  for (const [name, schedule] of schedules) {
    schedule().catch((err: Error) => {
      logger.error(`${name} job schedules not registered: ${err.message}`);
    });
  }
  // Each worker finishes its current job before its connection closes.
  return async () => {
    await Promise.allSettled(workers.map((w) => w.close()));
  };
}
