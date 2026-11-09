import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

type Fn = (arg?: unknown) => Promise<unknown>;
const findMany = jest.fn<Fn>();

jest.unstable_mockModule('../src/lib/prisma.js', () => ({
  prisma: { department: { findMany } },
}));
jest.unstable_mockModule('../src/lib/redis.js', () => ({ redis: {}, createRedis: jest.fn() }));

const { app } = await import('../src/app.js');

describe('GET /api/v1/departments', () => {
  it('lists departments without a session, selecting only public columns', async () => {
    findMany.mockResolvedValue([{ id: 1, name: 'CSE', description: 'Computer Science' }]);

    const res = await request(app).get('/api/v1/departments');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [{ id: 1, name: 'CSE', description: 'Computer Science' }],
    });
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    });
  });

  it('returns the error envelope when the database fails', async () => {
    findMany.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get('/api/v1/departments');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
    });
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
  });
});
