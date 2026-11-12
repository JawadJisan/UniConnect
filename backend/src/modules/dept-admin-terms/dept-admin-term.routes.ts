import {
  assignDeptAdminSchema,
  deptAdminTermIdParamSchema,
  deptAdminTermListQuerySchema,
  renewDeptAdminSchema,
} from '@uniconnect/shared';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody, validateRequest } from '../../middleware/validate.js';
import { deptAdminTermController } from './dept-admin-term.controller.js';

/** /api/v1/admin/dept-admin-terms (PRD FR-ADMIN-001–004, DECISIONS D34). super_admin only. */
export const deptAdminTermRouter = Router();

deptAdminTermRouter.use(requireAuth, requireRole(['super_admin']));

const byId = validateRequest('params', deptAdminTermIdParamSchema);

deptAdminTermRouter.get(
  '/',
  validateRequest('query', deptAdminTermListQuerySchema),
  deptAdminTermController.list,
);
deptAdminTermRouter.post('/', validateBody(assignDeptAdminSchema), deptAdminTermController.assign);
deptAdminTermRouter.patch('/:id/end', byId, deptAdminTermController.end);
deptAdminTermRouter.post(
  '/:id/renew',
  byId,
  validateBody(renewDeptAdminSchema),
  deptAdminTermController.renew,
);
