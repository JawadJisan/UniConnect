import {
  announcementIdParamSchema,
  announcementListQuerySchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from '@uniconnect/shared';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody, validateRequest } from '../../middleware/validate.js';
import { announcementController } from './announcement.controller.js';

/**
 * /api/v1/announcements (PRD FR-ANNOUNCE-001–004, DECISIONS D38). Every route needs a session.
 * Roles are checked here; which club or department the caller may act on depends on the row
 * (a moderator's scope is a club where they hold a seat), so the service checks it. No
 * requireDepartmentScope, as with events.
 */
export const announcementRouter = Router();

announcementRouter.use(requireAuth);

const posters = requireRole(['moderator', 'dept_admin', 'super_admin']);
const pinners = requireRole(['dept_admin', 'super_admin']);
const byId = validateRequest('params', announcementIdParamSchema);

announcementRouter.post(
  '/',
  posters,
  validateBody(createAnnouncementSchema),
  announcementController.create,
);
announcementRouter.get(
  '/',
  validateRequest('query', announcementListQuerySchema),
  announcementController.list,
);
announcementRouter.patch(
  '/:id',
  posters,
  byId,
  validateBody(updateAnnouncementSchema),
  announcementController.update,
);
announcementRouter.delete('/:id', posters, byId, announcementController.remove);
announcementRouter.patch('/:id/pin', pinners, byId, announcementController.togglePin);
