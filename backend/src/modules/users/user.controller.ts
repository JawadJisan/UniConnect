import type { Request, Response } from 'express';
import { badRequest, unauthorized } from '../../lib/http-error.js';
import { userService, type Caller } from './user.service.js';

// requireAuth runs before every route here; fail closed if it somehow didn't.
function callerOf(req: Request): Caller {
  const user = req.auth?.user;
  if (!user) throw unauthorized();
  return { id: user.id, userType: String(user.userType), ip: req.ip ?? null };
}

export const userController = {
  async getMe(req: Request, res: Response) {
    res.json({ success: true, data: await userService.getMe(callerOf(req).id) });
  },

  async mySessions(req: Request, res: Response) {
    const sessionId = req.auth?.session.id;
    if (!sessionId) throw unauthorized();
    res.json({ success: true, data: await userService.mySessions(callerOf(req).id, sessionId) });
  },

  async updateMe(req: Request, res: Response) {
    const data = await userService.updateMe(callerOf(req), req.body);
    res.json({ success: true, message: 'Profile updated.', data });
  },

  async updateAvatar(req: Request, res: Response) {
    if (!req.file) throw badRequest('FILE_REQUIRED', 'Send one image in the "avatar" field.');
    const data = await userService.updateAvatar(callerOf(req), req.file.buffer);
    res.json({ success: true, message: 'Avatar updated.', data });
  },
};
