import type { AdminUserListQuery } from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { unauthorized } from '../../lib/http-error.js';
import { adminUserService, type AdminCaller } from './admin-user.service.js';

// requireAuth and requireRole run before every route here; fail closed if they somehow didn't.
function callerOf(req: Request): AdminCaller {
  const user = req.auth?.user;
  if (!user) throw unauthorized();
  return { id: user.id, ip: req.ip ?? null };
}

// validateRequest('params') parsed the id into res.locals (Express 5's req.query is read-only).
const idOf = (res: Response) => (res.locals.params as { id: string }).id;

export const adminUserController = {
  async list(_req: Request, res: Response) {
    const { data, meta } = await adminUserService.list(res.locals.query as AdminUserListQuery);
    res.json({ success: true, data, meta });
  },

  async detail(_req: Request, res: Response) {
    res.json({ success: true, data: await adminUserService.detail(idOf(res)) });
  },

  async setStatus(req: Request, res: Response) {
    const data = await adminUserService.setStatus(callerOf(req), idOf(res), req.body);
    res.json({
      success: true,
      message: data.is_active ? 'User activated.' : 'User suspended.',
      data,
    });
  },

  async recomputeRole(req: Request, res: Response) {
    const data = await adminUserService.recomputeRole(callerOf(req), idOf(res));
    res.json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const data = await adminUserService.update(callerOf(req), idOf(res), req.body);
    res.json({ success: true, message: 'User updated.', data });
  },
};
