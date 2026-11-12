import {
  assignCommitteeSchema,
  clubIdParamSchema,
  committeeCandidateQuerySchema,
  committeeListQuerySchema,
  committeeMemberParamsSchema,
  updateCommitteeSchema,
} from '@uniconnect/shared';
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import {
  requireDepartmentScope,
  requireRole,
  type DepartmentResolver,
} from '../../middleware/auth.js';
import { validateBody, validateRequest } from '../../middleware/validate.js';
import { clubRepository } from '../clubs/club.repository.js';
import { committeeController } from './committee.controller.js';

/**
 * /api/v1/clubs/:id/committee (PRD FR-COMM-001–004, DECISIONS D34). Mounted by the club router,
 * which already ran requireAuth. The club param is `:id` everywhere (DECISIONS issue 6).
 */
export const committeeRouter = Router({ mergeParams: true });

const byClub = validateRequest('params', clubIdParamSchema);
const byMember = validateRequest('params', committeeMemberParamsSchema);

/** The club's department, or null (404) when the club doesn't exist. Runs after the params. */
const clubDepartment: DepartmentResolver = (req) =>
  clubRepository.findDepartmentId(prisma, Number(req.params.id));

// Only the club's own dept_admin or a super_admin manages the committee. Clubs are visible to
// everyone signed in, so a cross-department attempt is a 403, not a hidden 404.
const managers = requireRole(['dept_admin', 'super_admin']);
const scoped = requireDepartmentScope(clubDepartment);

committeeRouter.get(
  '/',
  byClub,
  validateRequest('query', committeeListQuerySchema),
  committeeController.list,
);
// Registered before /:memberId, or "candidates" would be parsed as a member id.
committeeRouter.get(
  '/candidates',
  managers,
  byClub,
  scoped,
  validateRequest('query', committeeCandidateQuerySchema),
  committeeController.candidates,
);
committeeRouter.post(
  '/',
  managers,
  byClub,
  scoped,
  validateBody(assignCommitteeSchema),
  committeeController.assign,
);
committeeRouter.patch(
  '/:memberId',
  managers,
  byMember,
  scoped,
  validateBody(updateCommitteeSchema),
  committeeController.update,
);
committeeRouter.patch(
  '/:memberId/end-term',
  managers,
  byMember,
  scoped,
  committeeController.endTerm,
);
