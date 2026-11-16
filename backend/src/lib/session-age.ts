import { prisma } from './prisma.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sessions slide by 7 days with use, but none outlives this from sign-in (DECISIONS §7 I2, D46):
 * a stolen cookie that keeps being used still dies, and everyone re-enters their password at
 * least monthly. Checked in Better Auth's before-hook (lib/auth.ts) and in requireAuth.
 */
export const SESSION_ABSOLUTE_MAX_MS = 30 * DAY_MS;

export function sessionTooOld(createdAt: Date | string | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  return now - new Date(createdAt).getTime() > SESSION_ABSOLUTE_MAX_MS;
}

/** Ends a session that ran past the absolute limit. */
export async function endExpiredSession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
