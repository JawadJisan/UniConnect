import { AsyncLocalStorage } from 'node:async_hooks';
import winston from 'winston';
import { env } from '../config/env.js';

/** The current request's id (middleware/guards.ts requestContext), for every log line. */
export const requestStore = new AsyncLocalStorage<{ requestId: string }>();

const withRequestId = winston.format((info) => {
  const requestId = requestStore.getStore()?.requestId;
  if (requestId) info.requestId = requestId;
  return info;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  silent: env.NODE_ENV === 'test',
  format:
    env.NODE_ENV === 'production'
      ? winston.format.combine(withRequestId(), winston.format.timestamp(), winston.format.json())
      : winston.format.combine(withRequestId(), winston.format.colorize(), winston.format.simple()),
  transports: [new winston.transports.Console()],
});
