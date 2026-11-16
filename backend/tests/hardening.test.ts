import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Phase 10 hardening (DECISIONS §7, D46): units that need no database.

const SECRET = 'a-proxy-secret-that-is-long-enough-123';
const mockEnv = { NODE_ENV: 'development', PROXY_SHARED_SECRET: SECRET as string | undefined };
jest.unstable_mockModule('../src/config/env.js', () => ({ env: mockEnv }));

const { AsyncLocalStorage } = await import('node:async_hooks');
const logLines: string[] = [];
const requestStore = new AsyncLocalStorage<{ requestId: string }>();
const record = (line: string) => {
  const id = requestStore.getStore()?.requestId;
  logLines.push(id ? `${line} [${id}]` : line);
};
jest.unstable_mockModule('../src/lib/logger.js', () => ({
  logger: { info: record, warn: record, error: record },
  requestStore,
}));
const consume = jest.fn<(key: string, window: number, max: number) => Promise<unknown>>();
jest.unstable_mockModule('../src/lib/rate-limit.js', () => ({ consume }));

const { clientIp } = await import('../src/middleware/client-ip.js');
const { describeError, errorHandler } = await import('../src/middleware/error-handler.js');
const { AUTH_BODY_MAX, authBodyLimit, ipRateLimit, requestContext, sameOriginMutations } =
  await import('../src/middleware/guards.js');
const { Prisma } = await import('../src/generated/prisma/client.js');

/** An app that reports what every reader of the client address would see. */
function probe() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(clientIp);
  const report: express.RequestHandler = (req, res) => {
    res.json({
      ip: req.ip,
      xff: req.headers['x-forwarded-for'],
      leaked: [req.headers['x-uniconnect-client-ip'], req.headers['x-uniconnect-proxy-secret']],
    });
  };
  app.get('/api/v1/health', report);
  app.get('/api/v1/thing', report);
  app.use(errorHandler);
  return app;
}

const SOCKET = /^(::ffff:)?127\.0\.0\.1$|^::1$/;

describe('clientIp (H1)', () => {
  beforeEach(() => {
    mockEnv.NODE_ENV = 'development';
    mockEnv.PROXY_SHARED_SECRET = SECRET;
  });

  it('believes the proxy-named address only with the right secret', async () => {
    const res = await request(probe())
      .get('/api/v1/thing')
      .set('x-uniconnect-proxy-secret', SECRET)
      .set('x-uniconnect-client-ip', '203.0.113.7')
      .set('X-Forwarded-For', '6.6.6.6');
    expect(res.body.ip).toBe('203.0.113.7');
    expect(res.body.xff).toBe('203.0.113.7');
    expect(res.body.leaked).toEqual([null, null]);
  });

  it('ignores a forged X-Forwarded-For and a wrong secret, using the socket address', async () => {
    const forged = await request(probe()).get('/api/v1/thing').set('X-Forwarded-For', '6.6.6.6');
    expect(forged.body.ip).toMatch(SOCKET);
    expect(forged.body.xff).toBe(forged.body.ip);

    const wrong = await request(probe())
      .get('/api/v1/thing')
      .set('x-uniconnect-proxy-secret', 'not-the-secret')
      .set('x-uniconnect-client-ip', '203.0.113.7');
    expect(wrong.body.ip).toMatch(SOCKET);
  });

  it('refuses a named address that is not an IP', async () => {
    const res = await request(probe())
      .get('/api/v1/thing')
      .set('x-uniconnect-proxy-secret', SECRET)
      .set('x-uniconnect-client-ip', '203.0.113.7, 6.6.6.6');
    expect(res.body.ip).toMatch(SOCKET);
  });

  it('in production, refuses requests that skipped the proxy, except health probes', async () => {
    mockEnv.NODE_ENV = 'production';
    const direct = await request(probe()).get('/api/v1/thing');
    expect(direct.status).toBe(403);
    expect(direct.body.error.code).toBe('PROXY_REQUIRED');

    expect((await request(probe()).get('/api/v1/health')).status).toBe(200);
    const proxied = await request(probe())
      .get('/api/v1/thing')
      .set('x-uniconnect-proxy-secret', SECRET);
    expect(proxied.status).toBe(200);
  });

  it('without a configured secret, never believes a named address', async () => {
    mockEnv.PROXY_SHARED_SECRET = undefined;
    const res = await request(probe())
      .get('/api/v1/thing')
      .set('x-uniconnect-proxy-secret', '')
      .set('x-uniconnect-client-ip', '203.0.113.7');
    expect(res.body.ip).toMatch(SOCKET);
  });
});

const ok: express.RequestHandler = (_req, res) => {
  res.json({ success: true });
};

describe('requestContext (PRD §21 request id)', () => {
  function app(fail = false) {
    const a = express();
    a.use(requestContext);
    a.get(
      '/api/v1/x',
      fail
        ? () => {
            throw new Error('boom');
          }
        : ok,
    );
    a.use(errorHandler);
    return a;
  }

  beforeEach(() => {
    logLines.length = 0;
  });

  it('issues an id, echoes a valid incoming one, and replaces a bad one', async () => {
    const fresh = await request(app()).get('/api/v1/x');
    expect(fresh.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const kept = await request(app()).get('/api/v1/x').set('x-request-id', 'trace-1234abcd');
    expect(kept.headers['x-request-id']).toBe('trace-1234abcd');

    const bad = await request(app()).get('/api/v1/x').set('x-request-id', '<script>');
    expect(bad.headers['x-request-id']).not.toBe('<script>');
  });

  it('logs one access line with the id and without the query string', async () => {
    await request(app())
      .get('/api/v1/x?search=ayesha@example.com')
      .set('x-request-id', 'trace-1234abcd');
    expect(logLines).toEqual([
      expect.stringMatching(/^GET \/api\/v1\/x 200 \d+ms \[trace-1234abcd\]$/),
    ]);
  });

  it('puts the id on a 500 so a report can be matched to its log line', async () => {
    const res = await request(app(true)).get('/api/v1/x').set('x-request-id', 'trace-1234abcd');
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
      request_id: 'trace-1234abcd',
    });
  });
});

describe('describeError (I6)', () => {
  it('names a Prisma error by class and code only, never its message', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on email = ayesha@example.com',
      { code: 'P2002', clientVersion: 'x' },
    );
    expect(describeError(err, true)).toBe('PrismaClientKnownRequestError P2002');
  });

  it('logs the stack only when asked (development)', () => {
    const err = new Error('boom');
    expect(describeError(err, false)).toBe('Error: boom');
    expect(describeError(err, true)).toContain('at ');
    expect(describeError('a string', true)).toBe('Non-Error thrown');
  });
});

describe('authBodyLimit (L4)', () => {
  const app = () => {
    const a = express();
    a.use('/api/auth', authBodyLimit);
    a.all('/api/auth/*splat', ok);
    a.use(errorHandler);
    return a;
  };

  it('refuses a body over the cap with 413 and lets a normal one through', async () => {
    const big = await request(app())
      .post('/api/auth/sign-in/email')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(AUTH_BODY_MAX) }));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');

    const small = await request(app()).post('/api/auth/sign-in/email').send({ email: 'a@b.c' });
    expect(small.status).toBe(200);
    expect((await request(app()).get('/api/auth/get-session')).status).toBe(200);
  });

  it('refuses a chunked body it cannot measure', () => {
    // A real client can't send both headers, so call the middleware with a length-less request.
    const headers: Record<string, string> = { 'transfer-encoding': 'chunked' };
    const req = { method: 'POST', get: (name: string) => headers[name.toLowerCase()] };
    const next = jest.fn();
    authBodyLimit(req as never, {} as never, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 411, code: 'LENGTH_REQUIRED' }),
    );
  });
});

describe('sameOriginMutations (I4)', () => {
  const ORIGIN = 'https://uniconnect.example.com';
  const app = () => {
    const a = express();
    a.use('/api/v1', sameOriginMutations(ORIGIN));
    a.all('/api/v1/*splat', ok);
    a.use(errorHandler);
    return a;
  };

  it('refuses a cross-site browser mutation', async () => {
    const other = await request(app()).post('/api/v1/events').set('Origin', 'https://evil.example');
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe('CROSS_SITE_REQUEST');
    const fetchSite = await request(app())
      .delete('/api/v1/events/1')
      .set('Sec-Fetch-Site', 'cross-site');
    expect(fetchSite.status).toBe(403);
  });

  it('allows the frontend origin, reads, header-less clients and the payment IPN', async () => {
    expect((await request(app()).post('/api/v1/events').set('Origin', ORIGIN)).status).toBe(200);
    const read = await request(app()).get('/api/v1/events').set('Origin', 'https://evil.example');
    expect(read.status).toBe(200);
    expect((await request(app()).post('/api/v1/events')).status).toBe(200);
    const ipn = await request(app())
      .post('/api/v1/memberships/payment/ipn')
      .set('Origin', 'https://sandbox.sslcommerz.com');
    expect(ipn.status).toBe(200);
  });
});

describe('ipRateLimit (I5)', () => {
  const app = (enabled = true) => {
    const a = express();
    a.use('/api', ipRateLimit({ enabled }));
    a.get('/api/v1/*splat', ok);
    a.use(errorHandler);
    return a;
  };

  beforeEach(() => {
    consume.mockReset();
    logLines.length = 0;
  });

  it('counts per IP and answers 429 with Retry-After over the limit', async () => {
    consume.mockResolvedValueOnce({ allowed: true, retryAfter: null });
    expect((await request(app()).get('/api/v1/departments')).status).toBe(200);
    expect(consume.mock.calls[0]![0]).toMatch(/^rl:ip:/);
    expect(consume.mock.calls[0]!.slice(1)).toEqual([60, 300]);

    consume.mockResolvedValueOnce({ allowed: false, retryAfter: 42 });
    const limited = await request(app()).get('/api/v1/departments');
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('42');
  });

  it('skips the health probes, fails open when Redis is down, and can be turned off', async () => {
    expect((await request(app()).get('/api/v1/health/ready')).status).toBe(200);
    expect(consume).not.toHaveBeenCalled();

    consume.mockRejectedValueOnce(new Error('rate limit store unavailable: down'));
    expect((await request(app()).get('/api/v1/departments')).status).toBe(200);
    expect(logLines[0]).toMatch(/ip rate limit skipped/);

    expect((await request(app(false)).get('/api/v1/departments')).status).toBe(200);
    expect(consume).toHaveBeenCalledTimes(1);
  });
});
