import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { auth } from './lib/auth.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { adminUserRouter } from './modules/admin-users/admin-user.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { departmentRouter } from './modules/departments/department.routes.js';
import { userRouter } from './modules/users/user.routes.js';

export const app = express();

// One proxy hop: the Next.js rewrite. req.ip is then the browser's address, which the
// rate limiters key on. Raise this only if another proxy is added in front.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));

// Better Auth reads the raw body itself, so it must stay before express.json() or requests hang.
app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json({ limit: '100kb' }));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/departments', departmentRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/admin/users', adminUserRouter);

// Liveness: the process is up. Touches no external service.
app.get('/api/v1/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'uniconnect-api' } });
});

const READY_TIMEOUT_MS = 5000;

async function check(run: () => Promise<unknown>): Promise<'ok' | 'error'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), READY_TIMEOUT_MS);
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

// Readiness: Postgres (Neon) and Redis (Upstash) both answer.
app.get('/api/v1/health/ready', async (_req, res) => {
  const [db, cache] = await Promise.all([
    check(() => prisma.$queryRaw`SELECT 1`),
    check(() => redis.ping()),
  ]);
  const ready = db === 'ok' && cache === 'ok';
  res.status(ready ? 200 : 503).json({ success: ready, data: { db, redis: cache } });
});

app.use('/api', notFoundHandler);
app.use(errorHandler);
