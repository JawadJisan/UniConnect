import { AUDIT_ACTIONS, PASSWORD_REQUIREMENTS_MESSAGE, passwordSchema } from '@uniconnect/shared';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import {
  APIError,
  createAuthMiddleware,
  getIP,
  getSessionFromCtx,
  isAPIError,
} from 'better-auth/api';
import { env } from '../config/env.js';
import { enqueueEmail } from '../queues/email.queue.js';
import { auditService, type AuditEntry } from '../services/audit.service.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { consume } from './rate-limit.js';
import { endExpiredSession, sessionTooOld } from './session-age.js';

const DAY = 24 * 60 * 60;

/**
 * request-password-reset answers no sooner than this (review M4, D46). Better Auth's queries for
 * a known and an unknown email differ by a database round trip (about 250 ms measured against
 * Neon from Dhaka), which is enough to tell whether an account exists. Padding every answer to a
 * floor above the slower path hides it.
 */
export const RESET_FLOOR_MS = 2000;
const resetStarted = new WeakMap<Request, number>();

async function padToFloor(request: Request | undefined): Promise<void> {
  const started = request && resetStarted.get(request);
  if (started === undefined) return;
  const wait = RESET_FLOOR_MS - (performance.now() - started);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/** Better Auth routes whose JSON body repeats the session token (review I1). */
const TOKEN_ECHO_PATHS = new Set(['/get-session', '/sign-in/email', '/list-sessions']);

/** Removes `token` from a response body in place: top level, `session`, and list entries. */
export function stripToken(body: unknown): void {
  if (!body || typeof body !== 'object' || isAPIError(body)) return;
  if (Array.isArray(body)) {
    for (const item of body) stripToken(item);
    return;
  }
  const record = body as Record<string, unknown>;
  delete record.token;
  if (record.session && typeof record.session === 'object') {
    delete (record.session as Record<string, unknown>).token;
  }
}

// Better Auth writes sign-in, verify-email and reset-password outside any transaction we can
// join, so these audit rows are written straight after its write. A failure is logged and
// never fails the user's request (docs/DECISIONS.md §3, audit exception).
async function auditAfterAuthWrite(entry: AuditEntry): Promise<void> {
  try {
    await auditService.record(prisma, entry);
  } catch (err) {
    logger.error(
      `audit ${entry.action} failed for user ${entry.userId}: ${(err as Error).message}`,
    );
  }
}

/**
 * Per-email limits from PRD FR-AUTH-003.4 and FR-AUTH-007.5, on top of the per-IP ones. Sign-in
 * is limited per account too (review M1), so guesses spread over forged client IPs still hit
 * one bucket. The 15-minute window keeps a deliberate lock-out short.
 */
export const PER_EMAIL_LIMITS: Record<string, { window: number; max: number }> = {
  '/sign-in/email': { window: 15 * 60, max: 10 },
  '/send-verification-email': { window: 5 * 60, max: 1 },
  '/request-password-reset': { window: 60 * 60, max: 3 },
};

const options = {
  appName: 'UniConnect',
  secret: env.BETTER_AUTH_SECRET,
  // The browser reaches /api/auth/* through the Next.js rewrite (docs/DECISIONS.md #23), so
  // links in emails and the cookie both belong to the frontend origin.
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/auth',
  trustedOrigins: [env.FRONTEND_ORIGIN],
  telemetry: { enabled: false },

  database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),

  // Users are created only by RegistrationService and the seed script, which set user_type and
  // role on the server. /update-user is replaced by PATCH /api/v1/users/me (FR-USER-002).
  // /verify-password is an unused password oracle for anyone holding a session (review L1).
  disabledPaths: ['/sign-up/email', '/update-user', '/verify-password'],

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 100,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await enqueueEmail({ kind: 'reset-password', to: user.email, name: user.name, url });
    },
    onPasswordReset: async ({ user }, request) => {
      await auditAfterAuthWrite({
        userId: user.id,
        action: AUDIT_ACTIONS.PASSWORD_CHANGED,
        entityType: 'user',
        entityId: user.id,
        newValue: { via: 'reset' },
        ipAddress: request ? getIP(request, options) : null,
      });
    },
  },

  emailVerification: {
    // Not awaited: a queue failure must not turn into a 500 that only existing, unverified
    // accounts get (review M4). Registration already tolerates a failed send.
    sendVerificationEmail: async ({ user, url }) => {
      void enqueueEmail({ kind: 'verify-email', to: user.email, name: user.name, url }).catch(
        (err: Error) => logger.error(`verification email not queued: ${err.message}`),
      );
    },
    sendOnSignUp: false,
    sendOnSignIn: false,
    autoSignInAfterVerification: false,
    expiresIn: DAY,
    afterEmailVerification: async (user, request) => {
      await auditAfterAuthWrite({
        userId: user.id,
        action: AUDIT_ACTIONS.EMAIL_VERIFIED,
        entityType: 'user',
        entityId: user.id,
        ipAddress: request ? getIP(request, options) : null,
      });
    },
  },

  session: {
    expiresIn: 7 * DAY,
    updateAge: DAY,
    // Off, so a role change or suspension applies on the very next request.
    cookieCache: { enabled: false },
  },

  user: {
    // Every extra column is server-owned through Better Auth. Students and faculty edit their
    // own profile through PATCH /api/v1/users/me, which has its own rules.
    additionalFields: {
      userType: { type: 'string', required: false, input: false },
      role: { type: 'string', required: false, input: false },
      departmentId: { type: 'number', required: false, input: false },
      bloodGroup: { type: 'string', required: false, input: false },
      isActive: { type: 'boolean', required: false, input: false },
      academicSession: { type: 'string', required: false, input: false },
      currentYear: { type: 'number', required: false, input: false },
      currentSemester: { type: 'number', required: false, input: false },
      studentId: { type: 'string', required: false, input: false },
      lastDonationDate: { type: 'date', required: false, input: false },
      phone: { type: 'string', required: false, input: false },
    },
  },

  databaseHooks: {
    session: {
      create: {
        // Suspended users get no session at all (FR-AUTH-004.3).
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true },
          });
          if (!user?.isActive) {
            throw new APIError('FORBIDDEN', {
              code: 'ACCOUNT_SUSPENDED',
              message: 'Account is suspended. Contact admin.',
            });
          }
        },
        after: async (session) => {
          await auditAfterAuthWrite({
            userId: session.userId,
            action: AUDIT_ACTIONS.LOGIN,
            entityType: 'session',
            entityId: session.id,
            ipAddress: session.ipAddress ?? null,
          });
        },
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === '/request-password-reset' && ctx.request) {
        resetStarted.set(ctx.request, performance.now());
      }

      // Better Auth checks only length, so apply the full policy to new passwords.
      if (ctx.path === '/reset-password' || ctx.path === '/change-password') {
        if (!passwordSchema.safeParse(ctx.body?.newPassword).success) {
          throw new APIError('BAD_REQUEST', {
            code: 'PASSWORD_TOO_WEAK',
            message: PASSWORD_REQUIREMENTS_MESSAGE,
          });
        }
      }

      // Suspended users keep no working session on Better Auth's own routes either; only
      // sign-out stays open so they can clear the cookie (review M2). requireAuth covers /api/v1.
      if (
        ctx.path !== '/sign-out' &&
        ctx.request?.headers.get('cookie')?.includes('session_token')
      ) {
        const current = await getSessionFromCtx(ctx, { disableRefresh: true });
        if (current && sessionTooOld(current.session.createdAt)) {
          await endExpiredSession(current.session.id);
          throw new APIError('UNAUTHORIZED', {
            code: 'SESSION_EXPIRED',
            message: 'Your session has expired. Sign in again.',
          });
        }
        if (current && (current.user as { isActive?: boolean }).isActive === false) {
          throw new APIError('FORBIDDEN', {
            code: 'ACCOUNT_SUSPENDED',
            message: 'Account is suspended. Contact admin.',
          });
        }
      }

      // Per-email limits apply to HTTP requests only. Server-side auth.api calls (the send at
      // registration) also run this hook and must not use up the user's resend budget.
      const limit = PER_EMAIL_LIMITS[ctx.path];
      const email = typeof ctx.body?.email === 'string' ? ctx.body.email.trim().toLowerCase() : '';
      if (limit && email && ctx.request && env.AUTH_EMAIL_LIMITS === 'on') {
        let result;
        try {
          result = await consume(`rl:email:${ctx.path}:${email}`, limit.window, limit.max);
        } catch (err) {
          // Fail open: the per-IP limit still applies.
          logger.error(`per-email rate limit unavailable: ${(err as Error).message}`);
        }
        if (result && !result.allowed) {
          throw new APIError('TOO_MANY_REQUESTS', {
            code: 'RATE_LIMITED',
            message: 'Too many requests for this email. Try again later.',
          });
        }
      }

      // A password change always signs out every other session, whatever the client sends
      // (review L7). A reset already revokes all of them.
      if (ctx.path === '/change-password') {
        return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      // The session token belongs in the httpOnly cookie only (review I1). Over HTTP, drop it
      // from the JSON of the routes that echo it; server-side auth.api calls keep theirs.
      if (ctx.request && TOKEN_ECHO_PATHS.has(ctx.path)) stripToken(ctx.context.returned);
      if (ctx.path === '/request-password-reset') await padToFloor(ctx.request);

      if (ctx.path !== '/change-password' || isAPIError(ctx.context.returned)) return;
      const userId = ctx.context.session?.user.id;
      if (!userId) return;
      await auditAfterAuthWrite({
        userId,
        action: AUDIT_ACTIONS.PASSWORD_CHANGED,
        entityType: 'user',
        entityId: userId,
        newValue: { via: 'change' },
        ipAddress: ctx.request ? getIP(ctx.request, options) : null,
      });
    }),
  },

  rateLimit: {
    // Better Auth enables this only in production by default. Tests mock Redis, so skip it there.
    enabled: env.NODE_ENV !== 'test',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/send-verification-email': { window: 5 * 60, max: 3 },
      '/request-password-reset': { window: 60 * 60, max: 5 },
      '/reset-password': { window: 60 * 60, max: 5 },
      // Tighter than Better Auth's built-in 3 per 10s: guesses at the current password (L1).
      '/change-password': { window: 60, max: 5 },
    },
    customStorage: {
      consume: (key, rule) => consume(`rl:auth:${key}`, rule.window, rule.max),
    },
  },

  advanced: {
    database: { generateId: false }, // Postgres gen_random_uuid() creates every id.
    // `Secure` follows an https BETTER_AUTH_URL, so a deploy can't lose it by NODE_ENV (L3).
    useSecureCookies: env.SECURE_COOKIES,
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    // middleware/client-ip.ts overwrites this header with the one verified address before the
    // Better Auth mount (H1), so whatever the browser sent never reaches here.
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth(options);

export type AuthSession = typeof auth.$Infer.Session;
