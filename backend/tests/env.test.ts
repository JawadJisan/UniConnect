import { describe, expect, it } from '@jest/globals';
import { parseEnv } from '../src/config/env.js';

// Production rules in src/config/env.ts (DECISIONS §7 L3, H1; D46). No values come from .env.

const base = {
  DATABASE_URL: 'postgresql://u:p@db.example.com/app',
  REDIS_URL: 'rediss://default:p@redis.example.com:6379',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
};

const production = {
  ...base,
  NODE_ENV: 'production',
  BETTER_AUTH_URL: 'https://uniconnect.example.com',
  FRONTEND_ORIGIN: 'https://uniconnect.example.com',
  PAYMENT_GATEWAY: 'disabled',
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'u',
  SMTP_PASS: 'p',
  SMTP_FROM: 'UniConnect <no-reply@example.com>',
  CLOUDINARY_CLOUD_NAME: 'c',
  CLOUDINARY_API_KEY: 'k',
  CLOUDINARY_API_SECRET: 's',
  GEMINI_API_KEY: 'g',
  GEMINI_MODEL: 'm',
  PROXY_SHARED_SECRET: 'p'.repeat(32),
};

/** The paths Zod complained about, or [] when the source is accepted. */
function problems(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
    return [];
  } catch (err) {
    return (err as { issues: { path: PropertyKey[] }[] }).issues.map((i) => i.path.join('.'));
  }
}

describe('parseEnv', () => {
  it('accepts a complete production setup and derives its defaults', () => {
    const env = parseEnv(production);
    expect(env.SECURE_COOKIES).toBe(true);
    expect(env.API_DOCS).toBe('off');
    expect(env.RUN_WORKERS_IN_API).toBe(false);
  });

  it('accepts PAYMENT_GATEWAY=disabled in production and still refuses mock (D47)', () => {
    expect(parseEnv(production).PAYMENT_GATEWAY).toBe('disabled');
    expect(problems({ ...production, PAYMENT_GATEWAY: 'mock' })).toEqual(['PAYMENT_GATEWAY']);
    expect(problems({ ...production, PAYMENT_GATEWAY: 'off' })).toEqual(['PAYMENT_GATEWAY']);
  });

  it('defaults docs on and workers in-process outside production, with non-Secure http cookies', () => {
    const env = parseEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_DOCS).toBe('on');
    expect(env.RUN_WORKERS_IN_API).toBe(true);
    expect(env.SECURE_COOKIES).toBe(false);
  });

  it('requires https origins in production, so the localhost defaults are refused (L3)', () => {
    const rest = { ...production, BETTER_AUTH_URL: undefined, FRONTEND_ORIGIN: undefined };
    expect(problems(rest)).toEqual(['BETTER_AUTH_URL', 'FRONTEND_ORIGIN']);
    expect(problems({ ...production, FRONTEND_ORIGIN: 'http://uniconnect.example.com' })).toEqual([
      'FRONTEND_ORIGIN',
    ]);
  });

  it('requires the proxy secret in production, at least 32 characters (H1)', () => {
    expect(problems({ ...production, PROXY_SHARED_SECRET: undefined })).toEqual([
      'PROXY_SHARED_SECRET',
    ]);
    expect(problems({ ...production, PROXY_SHARED_SECRET: 'short' })).toEqual([
      'PROXY_SHARED_SECRET',
    ]);
  });

  it('refuses a hosted deploy that is not NODE_ENV=production (L3)', () => {
    expect(problems({ ...base, RAILWAY_ENVIRONMENT_NAME: 'production' })).toEqual(['NODE_ENV']);
    expect(problems({ ...base, RENDER: 'true' })).toEqual(['NODE_ENV']);
  });

  it('treats empty values as unset', () => {
    expect(problems({ ...production, GEMINI_API_KEY: '' })).toEqual(['GEMINI_API_KEY']);
  });
});
