import {
  adminMembershipListQuerySchema,
  createMembershipSchema,
  membershipIdParamSchema,
  myMembershipsQuerySchema,
  paymentIpnSchema,
  renewMembershipSchema,
} from '@uniconnect/shared';
import express, { Router } from 'express';
import { requireAuth, requireRole, requireUserType } from '../../middleware/auth.js';
import { validateBody, validateRequest } from '../../middleware/validate.js';
import { membershipController } from './membership.controller.js';

/** /api/v1/memberships (PRD FR-MEM-001–004, DECISIONS D11, D32). */
export const membershipRouter = Router();

// The gateway's server-to-server callback: no session. SSLCommerz posts a form, so this route
// alone also parses urlencoded bodies. Registered before requireAuth.
membershipRouter.post(
  '/payment/ipn',
  express.urlencoded({ extended: false, limit: '20kb' }),
  validateBody(paymentIpnSchema),
  membershipController.ipn,
);

membershipRouter.use(requireAuth);

const byId = validateRequest('params', membershipIdParamSchema);
// Buying is about who someone is, not their authority: student moderators may buy (PRD §5).
const studentsOnly = requireUserType(['student']);

// Registered before /:id routes.
membershipRouter.get(
  '/my',
  studentsOnly,
  validateRequest('query', myMembershipsQuerySchema),
  membershipController.listMine,
);
membershipRouter.post(
  '/',
  studentsOnly,
  validateBody(createMembershipSchema),
  membershipController.purchase,
);
membershipRouter.post(
  '/:id/renew',
  studentsOnly,
  byId,
  validateBody(renewMembershipSchema),
  membershipController.renew,
);
// Owner, the club's dept_admin or super_admin: the service decides, because the rule depends on
// the membership row (PRD FR-MEM-003).
membershipRouter.patch('/:id/cancel', byId, membershipController.cancel);

/** /api/v1/admin/memberships (PRD FR-MEM-005). dept_admin sees only their department. */
export const adminMembershipRouter = Router();

adminMembershipRouter.use(requireAuth, requireRole(['dept_admin', 'super_admin']));
adminMembershipRouter.get(
  '/',
  validateRequest('query', adminMembershipListQuerySchema),
  membershipController.adminList,
);
