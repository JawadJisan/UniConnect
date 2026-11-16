import type {
  AssignDeptAdminInput,
  DeptAdminTermListQuery,
  RenewDeptAdminInput,
} from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { unauthorized } from '../../lib/http-error.js';
import { deptAdminTermService, type TermCaller } from './dept-admin-term.service.js';

// requireAuth runs before every route here; fail closed if it somehow didn't.
function callerOf(req: Request): TermCaller {
  const user = req.auth?.user;
  if (!user) throw unauthorized();
  return { id: user.id, ip: req.ip ?? null };
}

const idOf = (res: Response) => (res.locals.params as { id: number }).id;

export const deptAdminTermController = {
  async list(_req: Request, res: Response) {
    const { data, meta } = await deptAdminTermService.list(
      res.locals.query as DeptAdminTermListQuery,
    );
    res.json({ success: true, data, meta });
  },

  async assign(req: Request, res: Response) {
    const data = await deptAdminTermService.assign(callerOf(req), req.body as AssignDeptAdminInput);
    res.status(201).json({ success: true, message: 'Department admin assigned.', data });
  },

  async end(req: Request, res: Response) {
    const data = await deptAdminTermService.end(callerOf(req), idOf(res));
    res.json({ success: true, message: 'Department admin term ended.', data });
  },

  async renew(req: Request, res: Response) {
    const data = await deptAdminTermService.renew(
      callerOf(req),
      idOf(res),
      req.body as RenewDeptAdminInput,
    );
    res.status(201).json({ success: true, message: 'Department admin term renewed.', data });
  },
};
