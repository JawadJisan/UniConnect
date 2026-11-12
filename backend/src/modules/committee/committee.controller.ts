import type {
  AssignCommitteeInput,
  CommitteeCandidateQuery,
  CommitteeListQuery,
  UpdateCommitteeInput,
} from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { unauthorized } from '../../lib/http-error.js';
import type { ClubCaller } from '../clubs/club.service.js';
import { committeeService } from './committee.service.js';

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

// validateRequest('params') stored the parsed ids in res.locals.
const params = (res: Response) => res.locals.params as { id: number; memberId: number };

export const committeeController = {
  async list(_req: Request, res: Response) {
    const { data, meta } = await committeeService.list(
      params(res).id,
      res.locals.query as CommitteeListQuery,
    );
    res.json({ success: true, data, meta });
  },

  async candidates(req: Request, res: Response) {
    const data = await committeeService.candidates(
      callerOf(req),
      params(res).id,
      res.locals.query as CommitteeCandidateQuery,
    );
    res.json({ success: true, data });
  },

  async assign(req: Request, res: Response) {
    const data = await committeeService.assign(
      callerOf(req),
      params(res).id,
      req.body as AssignCommitteeInput,
    );
    res.status(201).json({ success: true, message: 'Committee member assigned.', data });
  },

  async update(req: Request, res: Response) {
    const { id, memberId } = params(res);
    const data = await committeeService.update(
      callerOf(req),
      id,
      memberId,
      req.body as UpdateCommitteeInput,
    );
    res.json({ success: true, message: 'Committee member updated.', data });
  },

  async endTerm(req: Request, res: Response) {
    const { id, memberId } = params(res);
    const data = await committeeService.endTerm(callerOf(req), id, memberId);
    res.json({ success: true, message: 'Committee term ended.', data });
  },
};
