import { chatbotAskSchema, chatLogQuerySchema } from '@uniconnect/shared';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AI_BUCKET, limitPerUser } from '../../middleware/rate-limit.js';
import { validateBody, validateRequest } from '../../middleware/validate.js';
import { chatbotController } from './chatbot.controller.js';

/** /api/v1/chatbot (PRD FR-AI-001; DECISIONS D44): any signed-in user, 10 asks a minute. */
export const chatbotRouter = Router();

chatbotRouter.post(
  '/ask',
  requireAuth,
  limitPerUser(AI_BUCKET),
  validateBody(chatbotAskSchema),
  chatbotController.ask,
);

/** /api/v1/admin/chatbot (PRD FR-AI-002): super_admin only. */
export const adminChatbotRouter = Router();

adminChatbotRouter.use(requireAuth, requireRole(['super_admin']));

adminChatbotRouter.get(
  '/logs',
  validateRequest('query', chatLogQuerySchema),
  chatbotController.logs,
);
