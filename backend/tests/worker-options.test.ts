import { describe, expect, it, jest } from '@jest/globals';

// Shared BullMQ worker options (DECISIONS D48). ioredis is replaced by a recorder, so no Redis
// is needed.
const connections: object[] = [];

jest.unstable_mockModule('ioredis', () => ({
  Redis: class {
    constructor() {
      connections.push(this);
    }
    on() {
      return this;
    }
  },
}));

const { drainDelayFor, workerOptions } = await import('../src/workers/options.js');

describe('worker options', () => {
  it('waits 30 s between idle polls in production and 5 s elsewhere', () => {
    expect(drainDelayFor('production')).toBe(30);
    expect(drainDelayFor('development')).toBe(5);
    expect(drainDelayFor('test')).toBe(5);
  });

  it('passes the concurrency and the drain delay through', () => {
    const options = workerOptions(5);
    expect(options.concurrency).toBe(5);
    expect(options.drainDelay).toBe(5); // tests run with NODE_ENV=test
  });

  it('gives every worker its own Redis connection', () => {
    const before = connections.length;
    const a = workerOptions(1);
    const b = workerOptions(1);
    expect(connections.length).toBe(before + 2);
    expect(a.connection).not.toBe(b.connection);
  });
});
