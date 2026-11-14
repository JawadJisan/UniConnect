import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { auth } from './lib/auth.js';
import { checkHealth } from './lib/health.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { adminUserRouter } from './modules/admin-users/admin-user.routes.js';
import { announcementRouter } from './modules/announcements/announcement.routes.js';
import { auditLogRouter } from './modules/audit-logs/audit-log.routes.js';
import { adminBloodRouter, bloodRouter } from './modules/blood/blood.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { clubRouter } from './modules/clubs/club.routes.js';
import { departmentRouter } from './modules/departments/department.routes.js';
import { deptAdminTermRouter } from './modules/dept-admin-terms/dept-admin-term.routes.js';
import { eventRouter } from './modules/events/event.routes.js';
import {
  adminMembershipRouter,
  membershipRouter,
} from './modules/memberships/membership.routes.js';
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
app.use('/api/v1/clubs', clubRouter);
app.use('/api/v1/memberships', membershipRouter);
app.use('/api/v1/admin/memberships', adminMembershipRouter);
app.use('/api/v1/admin/dept-admin-terms', deptAdminTermRouter);
app.use('/api/v1/events', eventRouter);
app.use('/api/v1/announcements', announcementRouter);
app.use('/api/v1/blood', bloodRouter);
app.use('/api/v1/admin/blood', adminBloodRouter);
app.use('/api/v1/admin/audit-logs', auditLogRouter);
app.use('/api/v1/dashboard', dashboardRouter);

// Liveness: the process is up. Touches no external service.
app.get('/api/v1/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'uniconnect-api' } });
});

// Readiness: Postgres (Neon) and Redis (Upstash) both answer.
app.get('/api/v1/health/ready', async (_req, res) => {
  const { db, redis: cache } = await checkHealth();
  const ready = db === 'ok' && cache === 'ok';
  res.status(ready ? 200 : 503).json({ success: ready, data: { db, redis: cache } });
});

app.use('/api', notFoundHandler);
app.use(errorHandler);
