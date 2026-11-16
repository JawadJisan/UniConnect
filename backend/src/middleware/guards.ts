import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from '../lib/http-error.js';
import { logger, requestStore } from '../lib/logger.js';
import { consume } from '../lib/rate-limit.js';

// Request-level hardening (PRD §21; DECISIONS §7 L4, I4, I5; D46). Mounted in app.ts right after
// clientIp, before Better Auth.

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * A request id (PRD §21): an incoming `x-request-id` if it looks like one, else a new UUID. It
 * is echoed in the response header and attached to every log line written for the request.
 * One access line per request: method, path without the query (queries can hold search text),
 * status and duration.
 */
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', id);
  const started = process.hrtime.bigint();
  requestStore.run({ requestId: id }, () => {
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      requestStore.run({ requestId: id }, () => {
        logger.info(`${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(0)}ms`);
      });
    });
    next();
  });
};

/** Largest body Better Auth will be handed (L4). Its own forms are a few hundred bytes. */
export const AUTH_BODY_MAX = 64 * 1024;

/**
 * L4: Better Auth reads the raw body itself, before express.json() and its 100 kB limit, so cap
 * it here. A body without a length (chunked) can't be checked up front and is refused.
 */
export const authBodyLimit: RequestHandler = (req, _res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const length = req.get('content-length');
  if (length === undefined && req.get('transfer-encoding')) {
    return next(new AppError(411, 'LENGTH_REQUIRED', 'Send the request with a Content-Length.'));
  }
  if (Number(length ?? 0) > AUTH_BODY_MAX) {
    return next(new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.'));
  }
  next();
};

/** Server-to-server routes with no browser Origin (the gateway's IPN). */
const CROSS_SITE_ALLOWED = new Set(['/api/v1/memberships/payment/ipn']);

/**
 * I4: a state-changing /api/v1 request from a browser must come from the frontend's origin.
 * Browsers always send `Origin` on cross-site POSTs and `Sec-Fetch-Site` everywhere, so a page
 * elsewhere can't make a signed-in visitor's browser change anything. Requests with neither
 * header (the payment gateway, curl, tests) aren't browsers riding a cookie and pass; the
 * session check still applies to them. SameSite=Lax cookies already stop most of this; this is
 * the second lock.
 */
export function sameOriginMutations(frontendOrigin: string): RequestHandler {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (CROSS_SITE_ALLOWED.has(req.originalUrl.split('?')[0]!)) return next();
    const origin = req.get('origin');
    const site = req.get('sec-fetch-site');
    if ((origin && origin !== frontendOrigin) || site === 'cross-site') {
      return next(new AppError(403, 'CROSS_SITE_REQUEST', 'This request came from another site.'));
    }
    next();
  };
}

/** I5 and PRD §21 "per IP (global)": generous enough for any person, a cap for scripts. */
export const IP_LIMIT = { window: 60, max: 300 } as const;

/**
 * A global per-IP limit on everything under /api except the health probes. Keys on req.ip,
 * which clientIp made trustworthy (H1). Fails open: a Redis outage must not take the site down;
 * the per-account auth limits and the fail-closed AI limit still apply.
 */
export function ipRateLimit({ enabled }: { enabled: boolean }): RequestHandler {
  return async (req, res, next) => {
    if (!enabled || req.originalUrl.startsWith('/api/v1/health')) return next();
    try {
      const result = await consume(`rl:ip:${req.ip}`, IP_LIMIT.window, IP_LIMIT.max);
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfter));
        return next(
          new AppError(429, 'RATE_LIMITED', 'Too many requests. Slow down and try again.'),
        );
      }
    } catch (err) {
      logger.warn(`ip rate limit skipped: ${(err as Error).message}`);
    }
    next();
  };
}
