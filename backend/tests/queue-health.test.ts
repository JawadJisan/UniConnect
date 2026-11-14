import { afterEach, describe, expect, it, jest } from '@jest/globals';

// src/lib/queue-health.ts (DECISIONS D42): per-queue BullMQ counts for the super admin
// dashboard. bullmq and Redis are replaced by recorders, so no Redis is needed.

type Counts = Record<string, number>;
type Listener = (err: Error) => void;

/** What each queue's getJobCounts does next, by queue name; default resolves with zeros. */
const behaviour = new Map<string, () => Promise<Counts>>();
const built: { name: string; closed: boolean; listeners: Listener[] }[] = [];

jest.unstable_mockModule('bullmq', () => ({
  Queue: class {
    private rec: (typeof built)[number];
    constructor(public name: string) {
      this.rec = { name, closed: false, listeners: [] };
      built.push(this.rec);
    }
    on(event: string, listener: Listener) {
      if (event === 'error') this.rec.listeners.push(listener);
      return this;
    }
    getJobCounts() {
      const run = behaviour.get(this.name);
      return run ? run() : Promise.resolve({ waiting: 0, active: 0, delayed: 0, failed: 0 });
    }
    async close() {
      this.rec.closed = true;
    }
  },
}));
jest.unstable_mockModule('../src/lib/redis.js', () => ({
  redis: {},
  createRedis: () => ({}),
}));
const loggedErrors: string[] = [];
jest.unstable_mockModule('../src/lib/logger.js', () => ({
  logger: { error: (msg: string) => loggedErrors.push(msg), info: () => {}, warn: () => {} },
}));

const { QUEUE_NAMES, queueHealth, closeQueueHealth } = await import('../src/lib/queue-health.js');

afterEach(async () => {
  jest.useRealTimers();
  behaviour.clear();
  await closeQueueHealth();
  built.length = 0;
  loggedErrors.length = 0;
});

describe('queueHealth', () => {
  it('reports every queue in order with its counts', async () => {
    behaviour.set('events', async () => ({ waiting: 3, active: 1, delayed: 2, failed: 4 }));
    behaviour.set('blood', async () => ({ waiting: 1 }));
    const result = await queueHealth();
    expect(result.map((q) => q.name)).toEqual([...QUEUE_NAMES]);
    expect(result.find((q) => q.name === 'events')).toEqual({
      name: 'events',
      state: 'ok',
      counts: { waiting: 3, active: 1, delayed: 2, failed: 4 },
    });
    // A missing count is 0, not undefined.
    expect(result.find((q) => q.name === 'blood')!.counts).toEqual({
      waiting: 1,
      active: 0,
      delayed: 0,
      failed: 0,
    });
  });

  it('marks a queue unavailable when its count rejects, without failing the rest', async () => {
    behaviour.set('email', () => Promise.reject(new Error('Connection is closed.')));
    const result = await queueHealth();
    expect(result[0]).toEqual({ name: 'email', state: 'unavailable', counts: null });
    expect(result.slice(1).every((q) => q.state === 'ok')).toBe(true);
  });

  it('marks a queue unavailable when its count never answers (3 s timeout)', async () => {
    jest.useFakeTimers();
    behaviour.set('terms', () => new Promise<Counts>(() => {}));
    const pending = queueHealth();
    await jest.advanceTimersByTimeAsync(3000);
    const result = await pending;
    expect(result.find((q) => q.name === 'terms')).toEqual({
      name: 'terms',
      state: 'unavailable',
      counts: null,
    });
  });

  it('builds the handles once and reuses them', async () => {
    await queueHealth();
    await queueHealth();
    expect(built).toHaveLength(QUEUE_NAMES.length);
  });

  it('logs a queue error by message only', async () => {
    await queueHealth();
    const err = Object.assign(new Error('WRONGPASS'), { command: { args: ['secret'] } });
    built[0]!.listeners[0]!(err);
    expect(loggedErrors).toEqual(['queue health: WRONGPASS']);
  });
});

describe('closeQueueHealth', () => {
  it('closes every handle, and the next call builds fresh ones', async () => {
    await queueHealth();
    const first = [...built];
    await closeQueueHealth();
    expect(first.every((q) => q.closed)).toBe(true);
    await queueHealth();
    expect(built).toHaveLength(QUEUE_NAMES.length * 2);
  });

  it('does nothing when no handle was built', async () => {
    await expect(closeQueueHealth()).resolves.toBeUndefined();
    expect(built).toHaveLength(0);
  });
});
