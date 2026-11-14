import { Router } from 'express';
import { requireAuth, requireRole, requireUserType } from '../../middleware/auth.js';
import { dashboardController } from './dashboard.controller.js';

/**
 * /api/v1/dashboard (PRD FR-DASH-001–004; DECISIONS D13 resolved 2026-11-14, D42).
 *
 * `/student` is the personal view for every student and faculty account, whatever its role, so
 * a student who becomes a moderator, or a faculty dept_admin, keeps it (D13). The membership
 * block inside is for user_type student only. The other three are each for one role.
 */
export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get(
  '/student',
  requireUserType(['student', 'faculty']),
  dashboardController.personal,
);
dashboardRouter.get('/moderator', requireRole(['moderator']), dashboardController.moderator);
dashboardRouter.get('/dept-admin', requireRole(['dept_admin']), dashboardController.deptAdmin);
dashboardRouter.get('/super-admin', requireRole(['super_admin']), dashboardController.superAdmin);
