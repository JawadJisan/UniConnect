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
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;
    const required = [
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_FROM',
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ] as const;
    for (const key of required) {
      if (!value[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
      }
    }
  });

// Empty strings in .env (KEY=) mean "not set".
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));

export const env = envSchema.parse(raw);
