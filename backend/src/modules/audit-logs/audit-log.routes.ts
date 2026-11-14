import { auditLogQuerySchema } from '@uniconnect/shared';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validate.js';
import { auditLogController } from './audit-log.controller.js';

/** /api/v1/admin/audit-logs (PRD FR-AUDIT-002, DECISIONS D42): super_admin only. */
export const auditLogRouter = Router();

auditLogRouter.use(requireAuth, requireRole(['super_admin']));

auditLogRouter.get('/', validateRequest('query', auditLogQuerySchema), auditLogController.list);
