import { clubIdParamSchema, clubListQuerySchema, updateClubSchema } from '@uniconnect/shared';
import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import {
  requireAuth,
  requireDepartmentScope,
  requireRole,
  type DepartmentResolver,
} from '../../middleware/auth.js';
import { logoUpload } from '../../middleware/upload.js';
import { validateBody, validateRequest } from '../../middleware/validate.js';
import { clubController } from './club.controller.js';
import { clubRepository } from './club.repository.js';

/** /api/v1/clubs (PRD FR-CLUB-001–004, DECISIONS D31). Every route needs a session. */
export const clubRouter = Router();

clubRouter.use(requireAuth);

const byId = validateRequest('params', clubIdParamSchema);

/** The club's department, or null (404) when the club doesn't exist. Runs after `byId`. */
const clubDepartment: DepartmentResolver = (req) =>
  clubRepository.findDepartmentId(prisma, Number(req.params.id));

// Only the club's own dept_admin or a super_admin may edit. Clubs are visible to everyone
// signed in, so a cross-department edit is a 403, not a hidden 404.
const canEdit = [
  requireRole(['dept_admin', 'super_admin']),
  byId,
  requireDepartmentScope(clubDepartment),
];

clubRouter.get('/', validateRequest('query', clubListQuerySchema), clubController.list);
// Registered before /:id, or "my-club" would be parsed as an id (DECISIONS issue 6).
clubRouter.get('/my-club', clubController.myClub);
clubRouter.get('/:id', byId, clubController.detail);
clubRouter.patch('/:id', ...canEdit, validateBody(updateClubSchema), clubController.update);
clubRouter.patch('/:id/logo', ...canEdit, logoUpload, clubController.updateLogo);
