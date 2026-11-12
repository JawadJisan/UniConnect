import type {
  CreateEventInput,
  EventListQuery,
  EventRegistrationsQuery,
  MyRegistrationsQuery,
  UpdateEventInput,
} from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { badRequest, unauthorized } from '../../lib/http-error.js';
import type { EventCaller } from './event.access.js';
import { eventService } from './event.service.js';
import { registrationService } from './registration.service.js';

// requireAuth runs before every route here; fail closed if it somehow didn't.
function callerOf(req: Request): EventCaller {
  const user = req.auth?.user;
  if (!user) throw unauthorized();
  return {
    id: user.id,
    role: user.role as string,
    departmentId: (user.departmentId as number | null | undefined) ?? null,
    ip: req.ip ?? null,
  };
}

// validateRequest('params') stored the parsed ids in res.locals.
const params = (res: Response) => res.locals.params as { id: number; regId: number };

export const eventController = {
  async create(req: Request, res: Response) {
    const data = await eventService.create(callerOf(req), req.body as CreateEventInput);
    res.status(201).json({ success: true, message: 'Event created as a draft.', data });
  },

  async list(req: Request, res: Response) {
    const { data, meta } = await eventService.list(
      callerOf(req),
      res.locals.query as EventListQuery,
    );
    res.json({ success: true, data, meta });
  },

  async detail(req: Request, res: Response) {
    const data = await eventService.detail(callerOf(req), params(res).id);
    res.json({ success: true, data });
  },

  async update(req: Request, res: Response) {
    const data = await eventService.update(
      callerOf(req),
      params(res).id,
      req.body as UpdateEventInput,
    );
    res.json({ success: true, message: 'Event updated.', data });
  },

  async updatePoster(req: Request, res: Response) {
    // posterUpload guarantees a file; keep the check so the handler is safe alone.
    if (!req.file) throw badRequest('FILE_REQUIRED', 'Send one image in the "poster" field.');
    const data = await eventService.updatePoster(callerOf(req), params(res).id, req.file.buffer);
    res.json({ success: true, message: 'Poster updated.', data });
  },

  async publish(req: Request, res: Response) {
    const data = await eventService.publish(callerOf(req), params(res).id);
    res.json({ success: true, message: 'Event published.', data });
  },

  async cancel(req: Request, res: Response) {
    const data = await eventService.cancel(callerOf(req), params(res).id);
    res.json({ success: true, message: 'Event cancelled.', data });
  },

  async complete(req: Request, res: Response) {
    const data = await eventService.complete(callerOf(req), params(res).id);
    res.json({ success: true, message: 'Event marked completed.', data });
  },

  async register(req: Request, res: Response) {
    const { data, reactivated } = await registrationService.register(callerOf(req), params(res).id);
    res.status(reactivated ? 200 : 201).json({ success: true, message: 'Registered.', data });
  },

  async cancelRegistration(req: Request, res: Response) {
    const data = await registrationService.cancel(callerOf(req), params(res).id);
    res.json({ success: true, message: 'Registration cancelled.', data });
  },

  async myRegistrations(req: Request, res: Response) {
    const { data, meta } = await registrationService.listMine(
      callerOf(req),
      res.locals.query as MyRegistrationsQuery,
    );
    res.json({ success: true, data, meta });
  },

  async registrations(req: Request, res: Response) {
    const q = res.locals.query as EventRegistrationsQuery;
    const { id } = params(res);
    if (q.format === 'csv') {
      const csv = await registrationService.csvForEvent(callerOf(req), id, q);
      res.type('text/csv; charset=utf-8').attachment(`event-${id}-registrations.csv`).send(csv);
      return;
    }
    const { data, meta } = await registrationService.listForEvent(callerOf(req), id, q);
    res.json({ success: true, data, meta });
  },

  async checkIn(req: Request, res: Response) {
    const { id, regId } = params(res);
    const data = await registrationService.checkIn(callerOf(req), id, regId);
    res.json({ success: true, message: 'Checked in.', data });
  },
};
