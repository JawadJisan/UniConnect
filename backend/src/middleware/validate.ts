import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { badRequest, type AppError } from '../lib/http-error.js';

/**
 * Parses `value` with a Zod schema. Returns the parsed (trimmed, lowercased) value, or the
 * 400 VALIDATION_ERROR the API uses everywhere. Services call this when the schema depends on
 * the caller (PATCH /users/me picks it by user_type).
 */
export function parseOrError<T>(
  schema: z.ZodType<T>,
  value: unknown,
): { ok: true; data: T } | { ok: false; error: AppError } {
  const result = schema.safeParse(value ?? {});
  if (result.success) return { ok: true, data: result.data };

  const issues = result.error.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }));
  // Surface the password policy message on its own, as PRD FR-AUTH-001 specifies.
  const message = issues.some((i) => i.path === 'password')
    ? 'Password does not meet requirements.'
    : 'Request validation failed.';
  return { ok: false, error: badRequest('VALIDATION_ERROR', message, issues) };
}

/** Parses req.body with a Zod schema, replacing it with the parsed value. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = parseOrError(schema, req.body);
    if (!result.ok) return next(result.error);
    req.body = result.data;
    next();
  };
}
