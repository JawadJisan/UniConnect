import {
  createEventSchema,
  eventIdParamSchema,
  eventListQuerySchema,
  eventRegistrationsQuerySchema,
  myRegistrationsQuerySchema,
  registrationParamsSchema,
  updateEventSchema,
} from '@uniconnect/shared';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { posterUpload } from '../../middleware/upload.js';
import { validateBody, validateRequest } from '../../middleware/validate.js';
import { eventController } from './event.controller.js';

/**
 * /api/v1/events (PRD FR-EVENT-001–012, DECISIONS D36). Every route needs a session.
 * Organizer routes check the role here. Which club the caller may manage depends on the
 * event (PRD #3: a moderator's own committee club, a dept_admin's department club), so the
 * service checks it. No requireDepartmentScope: a moderator's scope is a club, not a department.
 */
export const eventRouter = Router();

eventRouter.use(requireAuth);

const organizers = requireRole(['moderator', 'dept_admin', 'super_admin']);
// Everyone but super_admin registers (FR-EVENT-007, -008).
const attendees = requireRole(['student', 'faculty', 'moderator', 'dept_admin']);
const byId = validateRequest('params', eventIdParamSchema);

eventRouter.post('/', organizers, validateBody(createEventSchema), eventController.create);
eventRouter.get('/', validateRequest('query', eventListQuerySchema), eventController.list);
// Registered before /:id, or "my-registrations" would be parsed as an id (DECISIONS issue 6).
eventRouter.get(
  '/my-registrations',
  validateRequest('query', myRegistrationsQuerySchema),
  eventController.myRegistrations,
);
eventRouter.get('/:id', byId, eventController.detail);
eventRouter.patch(
  '/:id',
  organizers,
  byId,
  validateBody(updateEventSchema),
  eventController.update,
);
eventRouter.patch('/:id/poster', organizers, byId, posterUpload, eventController.updatePoster);
eventRouter.patch('/:id/publish', organizers, byId, eventController.publish);
eventRouter.patch('/:id/cancel', organizers, byId, eventController.cancel);
eventRouter.patch('/:id/complete', organizers, byId, eventController.complete);
eventRouter.post('/:id/register', attendees, byId, eventController.register);
eventRouter.delete('/:id/register', attendees, byId, eventController.cancelRegistration);
eventRouter.get(
  '/:id/registrations',
  organizers,
  byId,
  validateRequest('query', eventRegistrationsQuerySchema),
  eventController.registrations,
);
eventRouter.patch(
  '/:id/registrations/:regId/check-in',
  organizers,
  validateRequest('params', registrationParamsSchema),
  eventController.checkIn,
);
