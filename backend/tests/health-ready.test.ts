import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

// Mock the clients so this test needs neither Neon nor Upstash.
const queryRaw = jest.fn<() => Promise<unknown>>();
const ping = jest.fn<() => Promise<string>>();

jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: { $queryRaw: queryRaw } }));
jest.unstable_mockModule('../src/lib/redis.js', () => ({
  redis: { ping },
  createRedis: jest.fn(),
}));

const { app } = await import('../src/app.js');

describe('GET /api/v1/health/ready', () => {
  beforeEach(() => {
    queryRaw.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    ping.mockReset().mockResolvedValue('PONG');
  });

  it('returns 200 when Postgres and Redis both answer', async () => {
    const res = await request(app).get('/api/v1/health/ready');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { db: 'ok', redis: 'ok' } });
  });

  it('returns 503 and names Redis when it fails', async () => {
    ping.mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(app).get('/api/v1/health/ready');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, data: { db: 'ok', redis: 'error' } });
  });

  it('returns 503 and names the database when it fails', async () => {
    queryRaw.mockRejectedValue(new Error('connection terminated'));

    const res = await request(app).get('/api/v1/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.data).toEqual({ db: 'error', redis: 'ok' });
  });
});
