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

const DAY = 24 * 60 * 60;

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
    useSecureCookies: env.NODE_ENV === 'production',
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    // Set by the Next.js rewrite. A client-supplied value turns it into a list, which Better
    // Auth then ignores rather than trusting.
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth(options);

export type AuthSession = typeof auth.$Infer.Session;
