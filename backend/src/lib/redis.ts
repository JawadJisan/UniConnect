import { Redis, type RedisOptions } from 'ioredis';
import { env } from '../config/env.js';

// BullMQ requires maxRetriesPerRequest: null, and its workers need their own connections,
// so call createRedis() for each one. lazyConnect defers the TCP/TLS handshake to the
// first command, which keeps tests that import the app from opening a socket.
export function createRedis(options: RedisOptions = {}): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    ...options,
  });

  // Without a listener ioredis prints "Unhandled error event" with a stack trace on every
  // reconnect attempt. Log each distinct error once until the connection recovers.
  let last = '';
  client.on('error', (err: Error) => {
    if (err.message === last) return;
    last = err.message;
    console.error(`[redis] ${err.message}`);
  });
  client.on('ready', () => {
    last = '';
  });
  return client;
}

// Shared connection for request-path work (health checks, rate limiting, cache).
export const redis = createRedis();
