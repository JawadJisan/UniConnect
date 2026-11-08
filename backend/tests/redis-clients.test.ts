import { describe, expect, it, jest } from '@jest/globals';

// Regression tests for security review findings M3 and L2 (docs/DECISIONS.md §4).
// ioredis and bullmq are replaced by recorders, so no Redis is needed.
type Listener = (err: Error) => void;

const redisOptions: Record<string, unknown>[] = [];
const queueListeners: Record<string, Listener[]> = {};
const queueAdd = jest.fn<(name: string, data: unknown) => Promise<unknown>>();

jest.unstable_mockModule('ioredis', () => ({
  Redis: class {
    constructor(_url: string, options: Record<string, unknown>) {
      redisOptions.push(options);
    }
    on() {
      return this;
    }
  },
}));
jest.unstable_mockModule('bullmq', () => ({
  Queue: class {
    on(event: string, listener: Listener) {
      (queueListeners[event] ??= []).push(listener);
      return this;
    }
    add = queueAdd;
    close = async () => {};
  },
}));
const loggedErrors: string[] = [];
jest.unstable_mockModule('../src/lib/logger.js', () => ({
  logger: { error: (msg: string) => loggedErrors.push(msg), info: () => {}, warn: () => {} },
}));

const { redis, createRedis } = await import('../src/lib/redis.js');
const { enqueueEmail } = await import('../src/queues/email.queue.js');

describe('L2: the request-path Redis client fails fast instead of hanging', () => {
  it('limits retries and times out commands on the shared client', () => {
    expect(redis).toBeDefined();
    expect(redisOptions[0]).toMatchObject({ maxRetriesPerRequest: 1, commandTimeout: 2000 });
  });

  it('keeps BullMQ connections on unlimited retries, as BullMQ requires', () => {
    createRedis();
    expect(redisOptions.at(-1)).toMatchObject({ maxRetriesPerRequest: null });
  });
});

describe('M3: the email queue handles its own connection errors', () => {
  it('registers an error listener that logs only the message', async () => {
    queueAdd.mockResolvedValue({});
    await enqueueEmail({ kind: 'verify-email', to: 'a@b.co', name: 'A', url: 'http://x' });

    expect(queueListeners.error).toHaveLength(1);
    const err = Object.assign(new Error('WRONGPASS invalid password'), {
      command: { name: 'auth', args: ['default', 'super-secret-password'] },
    });
    queueListeners.error![0]!(err);

    expect(loggedErrors.join('\n')).toContain('WRONGPASS invalid password');
    expect(loggedErrors.join('\n')).not.toContain('super-secret-password');
  });
});
