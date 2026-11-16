import {
  bloodIdParamSchema,
  bloodRequestListQuerySchema,
  createBloodRequestSchema,
  createDonationSchema,
  donorListQuerySchema,
  myDonationsQuerySchema,
  unverifiedDonationsQuerySchema,
} from '@uniconnect/shared';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateBody, validateRequest } from '../../middleware/validate.js';
import { bloodController } from './blood.controller.js';

/**
 * /api/v1/blood (PRD FR-BLOOD-001–009, DECISIONS D40). Every route needs a session. Which
 * donation an admin may verify, and who may cancel a request, depend on the row's department,
 * so the services check them (no requireDepartmentScope, as with events and announcements).
 */
export const bloodRouter = Router();
bloodRouter.use(requireAuth);

/** Everyone but super_admin records donations (FR-BLOOD-001, -003). */
const donors = requireRole(['student', 'faculty', 'moderator', 'dept_admin']);
const admins = requireRole(['dept_admin', 'super_admin']);
const byId = validateRequest('params', bloodIdParamSchema);

bloodRouter.post(
  '/donations',
  donors,
  validateBody(createDonationSchema),
  bloodController.createDonation,
);
// Before any /donations/:id route.
bloodRouter.get(
  '/donations/my',
  donors,
  validateRequest('query', myDonationsQuerySchema),
  bloodController.myDonations,
);
bloodRouter.patch('/donations/:id/verify', admins, byId, bloodController.verifyDonation);

bloodRouter.get('/donors', validateRequest('query', donorListQuerySchema), bloodController.donors);

bloodRouter.post(
  '/requests',
  validateBody(createBloodRequestSchema),
  bloodController.createRequest,
);
bloodRouter.get(
  '/requests',
  validateRequest('query', bloodRequestListQuerySchema),
  bloodController.listRequests,
);
bloodRouter.patch('/requests/:id/fulfill', byId, bloodController.fulfillRequest);
bloodRouter.patch('/requests/:id/cancel', byId, bloodController.cancelRequest);

/** /api/v1/admin/blood (FR-BLOOD-010). */
export const adminBloodRouter = Router();
adminBloodRouter.use(requireAuth);
adminBloodRouter.get(
  '/donations/unverified',
  admins,
  validateRequest('query', unverifiedDonationsQuerySchema),
  bloodController.unverifiedDonations,
);
