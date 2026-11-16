import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { auth } from './lib/auth.js';
import { docsEnabled, docsRouter } from './docs/docs.routes.js';
import { checkHealth } from './lib/health.js';
import { mount } from './lib/mount.js';
import { clientIp } from './middleware/client-ip.js';
import {
  authBodyLimit,
  ipRateLimit,
  requestContext,
  sameOriginMutations,
} from './middleware/guards.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { adminUserRouter } from './modules/admin-users/admin-user.routes.js';
import { announcementRouter } from './modules/announcements/announcement.routes.js';
import { auditLogRouter } from './modules/audit-logs/audit-log.routes.js';
import { aiRouter } from './modules/ai/ai.routes.js';
import { adminBloodRouter, bloodRouter } from './modules/blood/blood.routes.js';
import { adminChatbotRouter, chatbotRouter } from './modules/chatbot/chatbot.routes.js';
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

// req.ip is the last X-Forwarded-For hop, and clientIp (below) rewrites that header to the one
// address it verified (H1). Keep this at 1: clientIp leaves exactly one value.
app.set('trust proxy', 1);

app.use(requestContext);
app.use(clientIp);

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }));
// Rate limiters are skipped under NODE_ENV=test, where Redis is mocked (backend rules).
app.use('/api', ipRateLimit({ enabled: env.NODE_ENV !== 'test' }));

// Better Auth reads the raw body itself, so it must stay before express.json() or requests hang.
// Its body is capped first (L4), since express.json()'s limit never sees it.
app.use('/api/auth', authBodyLimit);
app.all('/api/auth/*splat', toNodeHandler(auth));

app.use(express.json({ limit: '100kb' }));
app.use('/api/v1', sameOriginMutations(env.FRONTEND_ORIGIN));

mount(app, '/api/v1/auth', authRouter);
mount(app, '/api/v1/departments', departmentRouter);
mount(app, '/api/v1/users', userRouter);
mount(app, '/api/v1/admin/users', adminUserRouter);
mount(app, '/api/v1/clubs', clubRouter);
mount(app, '/api/v1/memberships', membershipRouter);
mount(app, '/api/v1/admin/memberships', adminMembershipRouter);
mount(app, '/api/v1/admin/dept-admin-terms', deptAdminTermRouter);
mount(app, '/api/v1/events', eventRouter);
mount(app, '/api/v1/announcements', announcementRouter);
mount(app, '/api/v1/blood', bloodRouter);
mount(app, '/api/v1/admin/blood', adminBloodRouter);
mount(app, '/api/v1/admin/audit-logs', auditLogRouter);
mount(app, '/api/v1/dashboard', dashboardRouter);
mount(app, '/api/v1/chatbot', chatbotRouter);
mount(app, '/api/v1/admin/chatbot', adminChatbotRouter);
mount(app, '/api/v1/ai', aiRouter);

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

// Interactive API docs (D46): off in production unless API_DOCS=on, then super admin only.
if (docsEnabled) app.use('/api/docs', docsRouter);

app.use('/api', notFoundHandler);
app.use(errorHandler);
