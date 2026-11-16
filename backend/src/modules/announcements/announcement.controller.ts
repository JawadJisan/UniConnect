import type {
  AnnouncementListQuery,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
} from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { unauthorized } from '../../lib/http-error.js';
import type { AnnouncementCaller } from './announcement.access.js';
import { announcementService } from './announcement.service.js';

// requireAuth runs before every route here; fail closed if it somehow didn't.
function callerOf(req: Request): AnnouncementCaller {
  const user = req.auth?.user;
  if (!user) throw unauthorized();
  return {
    id: user.id,
    role: user.role as string,
    departmentId: (user.departmentId as number | null | undefined) ?? null,
    ip: req.ip ?? null,
  };
}

// validateRequest('params') stored the parsed id in res.locals.
const idOf = (res: Response) => (res.locals.params as { id: number }).id;

export const announcementController = {
  async create(req: Request, res: Response) {
    const data = await announcementService.create(
      callerOf(req),
      req.body as CreateAnnouncementInput,
    );
    res.status(201).json({ success: true, message: 'Announcement posted.', data });
  },

  async list(req: Request, res: Response) {
    const { data, meta } = await announcementService.list(
      callerOf(req),
      res.locals.query as AnnouncementListQuery,
    );
    res.json({ success: true, data, meta });
  },

  async update(req: Request, res: Response) {
    const data = await announcementService.update(
      callerOf(req),
      idOf(res),
      req.body as UpdateAnnouncementInput,
    );
    res.json({ success: true, message: 'Announcement updated.', data });
  },

  async remove(req: Request, res: Response) {
    const data = await announcementService.remove(callerOf(req), idOf(res));
    res.json({ success: true, message: 'Announcement deleted.', data });
  },

  async togglePin(req: Request, res: Response) {
    const data = await announcementService.togglePin(callerOf(req), idOf(res));
    res.json({ success: true, message: data.is_pinned ? 'Pinned.' : 'Unpinned.', data });
  },
};
