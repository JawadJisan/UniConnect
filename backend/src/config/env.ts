import 'dotenv/config';
import { z } from 'zod';

// Only what running code needs. Add variables here as each integration is built.
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    FRONTEND_ORIGIN: z.url().default('http://localhost:3000'),
    // Neon pooled connection string (runtime). The Prisma CLI uses DATABASE_URL_UNPOOLED.
    DATABASE_URL: z.url(),
    // Upstash over TLS: rediss://default:<password>@<host>:6379
    REDIS_URL: z.url(),

    // Better Auth. BETTER_AUTH_URL is the browser-facing origin (the Next.js app), because
    // /api/auth/* is reached through its rewrite and cookies must be first-party.
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
    BETTER_AUTH_URL: z.url().default('http://localhost:3000'),
    // Per-email limits on sign-in, resend and reset (Redis). Only the Playwright API turns them
    // off: it signs the same seeded accounts in many times a run. Refused in production.
    AUTH_EMAIL_LIMITS: z.enum(['on', 'off']).default('on'),

    // SMTP. Optional in development: with no SMTP_HOST, emails are logged to the console.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),

    // Cloudinary (avatar uploads). Optional in development and test: without them the upload
    // route answers 503 UPLOAD_UNAVAILABLE. Tests mock src/lib/cloudinary.ts.
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    // Membership payments (DECISIONS D32, D47). `mock` stands in for SSLCommerz until the merchant
    // account exists; it is refused in production. `disabled` turns checkout off (503
    // PAYMENTS_UNAVAILABLE) and is the production value until `sslcommerz` is built.
    PAYMENT_GATEWAY: z.enum(['mock', 'sslcommerz', 'disabled']).default('mock'),

    // Gemini (PRD FR-AI; DECISIONS D44). Optional in development and test: without both, the
    // chatbot and the event description generator answer 503 AI_NOT_CONFIGURED. The model ID is
    // never hard-coded. Tests mock src/lib/gemini.ts.
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().optional(),

    // The Next.js proxy's shared secret (DECISIONS §7 H1, D46). Only a request carrying it may
    // name the client IP; in production a request without it is refused, so the API port can't
    // be used directly. Optional in development and test, where the socket address is used.
    PROXY_SHARED_SECRET: z
      .string()
      .min(32, 'PROXY_SHARED_SECRET must be at least 32 characters')
      .optional(),
    // Interactive API docs at /api/docs (PRD §3, §21; D46). Defaults to on outside production;
    // in production `on` serves them to the super admin only.
    API_DOCS: z.enum(['on', 'off']).optional(),
    // Run the BullMQ workers inside the API process (D46). Defaults to true outside production;
    // production runs them as their own service (`pnpm start:worker`).
    RUN_WORKERS_IN_API: z.enum(['true', 'false']).optional(),

    // Read only to detect a hosting platform (L3 below).
    RAILWAY_ENVIRONMENT_NAME: z.string().optional(),
    RENDER: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    // L3: a hosted deploy that forgot NODE_ENV would otherwise run as development. Railway and
    // Render set these on every deploy; local machines and CI don't.
    if (value.NODE_ENV !== 'production' && (value.RAILWAY_ENVIRONMENT_NAME || value.RENDER)) {
      ctx.addIssue({
        code: 'custom',
        path: ['NODE_ENV'],
        message: 'NODE_ENV must be production on a hosting platform',
      });
    }
    if (value.NODE_ENV !== 'production') return;
    for (const key of ['BETTER_AUTH_URL', 'FRONTEND_ORIGIN'] as const) {
      if (!value[key].startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} must be https in production`,
        });
      }
    }
    if (value.AUTH_EMAIL_LIMITS === 'off') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_EMAIL_LIMITS'],
        message: 'AUTH_EMAIL_LIMITS cannot be off in production',
      });
    }
    if (value.PAYMENT_GATEWAY === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_GATEWAY'],
        message: 'PAYMENT_GATEWAY cannot be mock in production',
      });
    }
    const required = [
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_FROM',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
      'GEMINI_API_KEY',
      'GEMINI_MODEL',
      'PROXY_SHARED_SECRET',
    ] as const;
    for (const key of required) {
      if (!value[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
      }
    }
  });

/**
 * Validates a set of variables. Exported for tests; the app uses `env` below. Empty strings
 * (`KEY=` in .env) mean "not set".
 */
export function parseEnv(source: Record<string, string | undefined>) {
  const raw = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const parsed = envSchema.parse(raw);
  const production = parsed.NODE_ENV === 'production';
  return {
    ...parsed,
    API_DOCS: parsed.API_DOCS ?? (production ? 'off' : 'on'),
    RUN_WORKERS_IN_API: (parsed.RUN_WORKERS_IN_API ?? (production ? 'false' : 'true')) === 'true',
    /** Cookies carry `Secure` whenever the browser-facing origin is https (L3), not by NODE_ENV. */
    SECURE_COOKIES: parsed.BETTER_AUTH_URL.startsWith('https://'),
  };
}

export type Env = ReturnType<typeof parseEnv>;

export const env: Env = parseEnv(process.env);
