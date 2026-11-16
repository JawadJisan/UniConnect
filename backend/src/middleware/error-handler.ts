import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/http-error.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found.' } });
};

// Express recognises error handlers by their four parameters, so `_next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // A unique index caught a race the service's pre-check missed.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'A record with these details already exists.' },
    });
    return;
  }

  // express.json() rejects malformed bodies with a 400 that carries `type`.
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' },
    });
    return;
  }

  logger.error(describeError(err, env.NODE_ENV === 'development'));
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
      // Quote this when reporting the problem; the same id is on the server's log line.
      request_id: res.getHeader('x-request-id'),
    },
  });
};

/**
 * What an unexpected error puts in the log (DECISIONS §7 I6). A Prisma error is named by its
 * class and code only: its message can quote the query's values (emails, phone numbers). The
 * stack is logged only in development, where it helps and the data is local.
 */
export function describeError(err: unknown, withStack: boolean): string {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientValidationError ||
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    const code = 'code' in err && err.code ? ` ${String(err.code)}` : '';
    return `${err.name}${code}`;
  }
  if (err instanceof Error)
    return withStack && err.stack ? err.stack : `${err.name}: ${err.message}`;
  return 'Non-Error thrown';
}
