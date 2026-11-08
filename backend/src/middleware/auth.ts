import type { Role } from '@uniconnect/shared';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, RequestHandler } from 'express';
import { auth, type AuthSession } from '../lib/auth.js';
import { forbidden, notFound, unauthorized } from '../lib/http-error.js';

/**
 * Layer 1. Resolves the Better Auth session from the cookie and loads the user. The user row
 * is read from the database on every request (cookie cache is off), so suspension and role
 * changes apply immediately.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const { headers, response } = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
    returnHeaders: true,
  });

  // Sliding sessions: when Better Auth extends the session it refreshes the cookie.
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) res.append('Set-Cookie', cookies);

  if (!response) return next(unauthorized());
  if (response.user.isActive === false) {
    return next(forbidden('Account is suspended. Contact admin.'));
  }
  req.auth = response;
  next();
};

// A route that forgot requireAuth must fail loudly, never fall through as allowed.
function sessionOf(req: Request): AuthSession {
  if (!req.auth) throw new Error('requireAuth must run before this middleware');
  return req.auth;
}

/** Layer 2. The caller's effective role must be one of `roles`. */
export function requireRole(roles: readonly Role[]): RequestHandler {
  return (req, _res, next) => {
    const { user } = sessionOf(req);
    if (!roles.includes(user.role as Role)) return next(forbidden());
    next();
  };
}

/** Returns the department that owns the target resource, or null when it doesn't exist. */
export type DepartmentResolver = (req: Request) => Promise<number | null> | number | null;

/**
 * Layer 3, tenant isolation. The target resource must belong to the caller's department.
 * super_admin bypasses. With `hide`, a mismatch is a 404 so existence isn't revealed.
 */
export function requireDepartmentScope(
  resolve: DepartmentResolver,
  { hide = false }: { hide?: boolean } = {},
): RequestHandler {
  return async (req, _res, next) => {
    const { user } = sessionOf(req);
    if (user.role === 'super_admin') return next();

    const departmentId = await resolve(req);
    if (departmentId === null) return next(notFound());
    if (departmentId !== user.departmentId) return next(hide ? notFound() : forbidden());
    next();
  };
}

/** Resolver for routes whose path carries the department id, e.g. /departments/:departmentId. */
export function departmentFromParam(name: string): DepartmentResolver {
  return (req) => {
    const value = Number(req.params[name]);
    return Number.isInteger(value) && value > 0 ? value : null;
  };
}
