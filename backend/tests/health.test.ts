import { describe, expect, it } from '@jest/globals';
import { ROLES } from '@uniconnect/shared';
import request from 'supertest';
import { app } from '../src/app.js';

describe('project setup', () => {
  it('serves the health check', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('resolves the shared package', () => {
    expect(ROLES).toContain('moderator');
  });
});
