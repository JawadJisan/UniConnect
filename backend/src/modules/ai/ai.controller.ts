import type { GenerateEventDescriptionInput } from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { aiService } from './ai.service.js';

export const aiController = {
  /** POST /ai/generate-event-description (FR-AI-003). */
  async eventDescription(req: Request, res: Response) {
    const data = await aiService.eventDescription(req.body as GenerateEventDescriptionInput);
    res.json({ success: true, data });
  },
};
