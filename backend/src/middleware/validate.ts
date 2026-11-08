import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { badRequest } from '../lib/http-error.js';

/** Parses req.body with a Zod schema, replacing it with the parsed (trimmed, lowercased) value. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      // Surface the password policy message on its own, as PRD FR-AUTH-001 specifies.
      const message = issues.some((i) => i.path === 'password')
        ? 'Password does not meet requirements.'
        : 'Request validation failed.';
      return next(badRequest('VALIDATION_ERROR', message, issues));
    }
    req.body = result.data;
    next();
  };
}
