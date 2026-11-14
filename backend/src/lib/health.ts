import { prisma } from './prisma.js';
import { redis } from './redis.js';

export type HealthState = 'ok' | 'error';

/** Runs a check with a timeout; any failure or timeout is `error`, never a throw. */
export async function withTimeout(run: () => Promise<unknown>, ms: number): Promise<HealthState> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  try {
    await Promise.race([run(), timeout]);
    return 'ok';
  } catch {
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

const READY_TIMEOUT_MS = 5000;

/** Postgres (Neon) and Redis (Upstash) both answer: /health/ready and the super admin dashboard. */
export async function checkHealth(): Promise<{ db: HealthState; redis: HealthState }> {
  const [db, cache] = await Promise.all([
    withTimeout(() => prisma.$queryRaw`SELECT 1`, READY_TIMEOUT_MS),
    withTimeout(() => redis.ping(), READY_TIMEOUT_MS),
  ]);
  return { db, redis: cache };
}
