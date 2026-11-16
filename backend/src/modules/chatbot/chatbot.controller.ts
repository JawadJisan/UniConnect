import type { ChatbotAskInput, ChatLogQuery } from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { unauthorized } from '../../lib/http-error.js';
import type { EventCaller } from '../events/event.access.js';
import { chatbotService } from './chatbot.service.js';

// requireAuth runs before every chatbot route; fail closed if it somehow didn't.
function callerOf(req: Request): EventCaller {
  const user = req.auth?.user;
  if (!user) throw unauthorized();
  return {
    id: user.id,
    role: String(user.role),
    departmentId: (user.departmentId as number | null | undefined) ?? null,
    ip: req.ip ?? null,
  };
}

export const chatbotController = {
  /** POST /chatbot/ask (FR-AI-001). */
  async ask(req: Request, res: Response) {
    const { question } = req.body as ChatbotAskInput;
    const data = await chatbotService.ask(callerOf(req), question);
    res.json({ success: true, data });
  },

  /** GET /admin/chatbot/logs (FR-AI-002). The query was parsed into res.locals. */
  async logs(_req: Request, res: Response) {
    const { data, meta } = await chatbotService.logs(res.locals.query as ChatLogQuery);
    res.json({ success: true, data, meta });
  },
};
