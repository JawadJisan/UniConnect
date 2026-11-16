import {
  adminUpdateUserSchema,
  adminUserListQuerySchema,
  updateUserStatusSchema,
  userIdParamSchema,
} from '@uniconnect/shared';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody, validateRequest } from '../../middleware/validate.js';
import { adminUserController } from './admin-user.controller.js';

/** /api/v1/admin/users (PRD FR-USER-005, DECISIONS D28–D29). super_admin only. */
export const adminUserRouter = Router();

adminUserRouter.use(requireAuth, requireRole(['super_admin']));

const byId = validateRequest('params', userIdParamSchema);

adminUserRouter.get(
  '/',
  validateRequest('query', adminUserListQuerySchema),
  adminUserController.list,
);
adminUserRouter.get('/:id', byId, adminUserController.detail);
adminUserRouter.patch(
  '/:id',
  byId,
  validateBody(adminUpdateUserSchema),
  adminUserController.update,
);
adminUserRouter.patch(
  '/:id/status',
  byId,
  validateBody(updateUserStatusSchema),
  adminUserController.setStatus,
);
adminUserRouter.post('/:id/recompute-role', byId, adminUserController.recomputeRole);
