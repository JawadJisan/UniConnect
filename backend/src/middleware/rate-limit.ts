import type { RequestHandler } from 'express';
import { AppError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';
import { consume } from '../lib/rate-limit.js';

// Per-user fixed-window limits in Redis (PRD §19: 10/min for the chatbot per user; DECISIONS
// D44). Runs after requireAuth. Routes that share a `bucket` share one count: FR-AI-003 shares
// the chatbot's. Unlike the auth limits it fails closed: if Redis can't count, the request is
// refused with 503, so a Redis outage can't open unlimited Gemini spend.

export const AI_BUCKET = { bucket: 'ai', window: 60, max: 10 } as const;

export function limitPerUser({
  bucket,
  window,
  max,
}: {
  bucket: string;
  window: number;
  max: number;
}): RequestHandler {
  return async (req, res, next) => {
    const userId = req.auth?.user.id;
    if (!userId) {
      next(new Error('limitPerUser ran before requireAuth'));
      return;
    }
    let result: Awaited<ReturnType<typeof consume>>;
    try {
      result = await consume(`rl:${bucket}:${userId}`, window, max);
    } catch (err) {
      logger.error(`rate limit (${bucket}): ${(err as Error).message}`);
      next(new AppError(503, 'AI_UNAVAILABLE', 'The assistant is unavailable. Try again shortly.'));
      return;
    }
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfter));
      next(
        new AppError(
          429,
          'RATE_LIMITED',
          `Too many requests. Try again in ${result.retryAfter} seconds.`,
        ),
      );
      return;
    }
    next();
  };
}
