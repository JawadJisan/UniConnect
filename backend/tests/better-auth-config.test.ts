import { describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

// The real Better Auth config, with Prisma and Redis mocked out. These routes are rejected
// before Better Auth touches the database.
jest.unstable_mockModule('../src/lib/prisma.js', () => ({ prisma: {} }));
jest.unstable_mockModule('../src/lib/redis.js', () => ({ redis: {}, createRedis: jest.fn() }));

const { app } = await import('../src/app.js');

describe('Better Auth routes', () => {
  it('has no public sign-up route, so clients cannot choose their own role', async () => {
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .set('Origin', 'http://localhost:3000')
      .send({ name: 'X', email: 'x@example.com', password: 'Str0ng!pass', role: 'super_admin' });

    expect(res.status).toBe(404);
  });

  it('has no /update-user route, so profile fields go through PATCH /users/me', async () => {
    const res = await request(app)
      .post('/api/auth/update-user')
      .set('Origin', 'http://localhost:3000')
      .send({ departmentId: 2 });

    expect(res.status).toBe(404);
  });

  it('answers unknown /api routes with the JSON 404 envelope', async () => {
    const res = await request(app).get('/api/v1/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found.' },
    });
  });
});
