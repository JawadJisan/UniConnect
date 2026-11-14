import { generateEventDescriptionSchema } from '@uniconnect/shared';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AI_BUCKET, limitPerUser } from '../../middleware/rate-limit.js';
import { validateBody } from '../../middleware/validate.js';
import { aiController } from './ai.controller.js';

/**
 * /api/v1/ai (PRD FR-AI-003; DECISIONS D44): organizers only. Shares the chatbot's per-user
 * limit (PRD: "Shares the chatbot's rate limit"), so the two together allow 10 a minute.
 */
export const aiRouter = Router();

aiRouter.post(
  '/generate-event-description',
  requireAuth,
  requireRole(['moderator', 'dept_admin', 'super_admin']),
  limitPerUser(AI_BUCKET),
  validateBody(generateEventDescriptionSchema),
  aiController.eventDescription,
);
