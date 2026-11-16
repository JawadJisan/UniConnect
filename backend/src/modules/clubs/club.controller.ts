import type { ClubListQuery, UpdateClubInput } from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { badRequest, unauthorized } from '../../lib/http-error.js';
import { clubService, type ClubCaller } from './club.service.js';

// requireAuth runs before every route here; fail closed if it somehow didn't.
function callerOf(req: Request): ClubCaller {
  const user = req.auth?.user;
  if (!user) throw unauthorized();
  return {
    id: user.id,
    role: user.role as string,
    departmentId: (user.departmentId as number | null | undefined) ?? null,
    ip: req.ip ?? null,
  };
}

// validateRequest('params') parsed the id into res.locals (Express 5's req.query is read-only).
const idOf = (res: Response) => (res.locals.params as { id: number }).id;

export const clubController = {
  async list(_req: Request, res: Response) {
    const { data, meta } = await clubService.list(res.locals.query as ClubListQuery);
    res.json({ success: true, data, meta });
  },

  async myClub(req: Request, res: Response) {
    res.json({ success: true, data: await clubService.getMyClub(callerOf(req)) });
  },

  async detail(_req: Request, res: Response) {
    res.json({ success: true, data: await clubService.getById(idOf(res)) });
  },

  async update(req: Request, res: Response) {
    const data = await clubService.update(callerOf(req), idOf(res), req.body as UpdateClubInput);
    res.json({ success: true, message: 'Club updated.', data });
  },

  async updateLogo(req: Request, res: Response) {
    if (!req.file) throw badRequest('FILE_REQUIRED', 'Send one image in the "logo" field.');
    const data = await clubService.updateLogo(callerOf(req), idOf(res), req.file.buffer);
    res.json({ success: true, message: 'Logo updated.', data });
  },
};
