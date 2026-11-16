import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../lib/http-error.js';

// One trusted client address per request (DECISIONS §7 H1, D46).
//
// The Next.js proxy (frontend/src/proxy.ts) sends the visitor's address in CLIENT_IP_HEADER,
// together with PROXY_SHARED_SECRET. Only with a matching secret is that address believed;
// otherwise the socket address is used. The result is written over `X-Forwarded-For` as a single
// value, which is the one place both readers look: `req.ip` (with `trust proxy` 1, the last hop)
// and Better Auth's `ipAddressHeaders`. So a forged `X-Forwarded-For` never reaches a rate
// limiter, a session row or an audit row. Mount it first, before Better Auth.

export const CLIENT_IP_HEADER = 'x-uniconnect-client-ip';
export const SECRET_HEADER = 'x-uniconnect-proxy-secret';

/** Health probes come from the host's checker straight to the port, never through the proxy. */
const DIRECT_PATHS = new Set(['/api/v1/health', '/api/v1/health/ready']);

const digest = (value: string) => createHash('sha256').update(value).digest();

function secretMatches(sent: string | undefined): boolean {
  if (!env.PROXY_SHARED_SECRET || !sent) return false;
  return timingSafeEqual(digest(sent), digest(env.PROXY_SHARED_SECRET));
}

export const clientIp: RequestHandler = (req, _res, next) => {
  const fromProxy = secretMatches(req.get(SECRET_HEADER));
  const claimed = req.get(CLIENT_IP_HEADER)?.trim();
  const socket = req.socket.remoteAddress ?? '';
  const ip = fromProxy && claimed && isIP(claimed) ? claimed : socket;

  req.headers['x-forwarded-for'] = ip;
  delete req.headers[CLIENT_IP_HEADER];
  delete req.headers[SECRET_HEADER];

  // In production only the proxy may call the API: the port is not a second front door.
  if (env.NODE_ENV === 'production' && !fromProxy && !DIRECT_PATHS.has(req.path)) {
    next(new AppError(403, 'PROXY_REQUIRED', 'Requests must come through the UniConnect site.'));
    return;
  }
  next();
};
