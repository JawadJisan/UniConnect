import type {
  AdminMembershipListQuery,
  CreateMembershipInput,
  MyMembershipsQuery,
  PaymentIpnInput,
  RenewMembershipInput,
} from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { unauthorized } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { paymentService } from '../payments/payment.service.js';
import { membershipService, type MembershipCaller } from './membership.service.js';

// requireAuth runs before every route but the IPN; fail closed if it somehow didn't.
function callerOf(req: Request): MembershipCaller {
  const user = req.auth?.user;
  if (!user) throw unauthorized();
  return {
    id: user.id,
    role: String(user.role),
    userType: String(user.userType),
    departmentId: (user.departmentId as number | null | undefined) ?? null,
    name: user.name,
    email: user.email,
    phone: (user.phone as string | null | undefined) ?? null,
    ip: req.ip ?? null,
  };
}

// validateRequest('params') parsed the id into res.locals (Express 5's req.query is read-only).
const idOf = (res: Response) => (res.locals.params as { id: number }).id;

export const membershipController = {
  async purchase(req: Request, res: Response) {
    const data = await membershipService.purchase(callerOf(req), req.body as CreateMembershipInput);
    res.status(201).json({ success: true, message: 'Checkout started.', data });
  },

  async renew(req: Request, res: Response) {
    const data = await membershipService.renew(
      callerOf(req),
      idOf(res),
      req.body as RenewMembershipInput,
    );
    res.status(201).json({ success: true, message: 'Renewal checkout started.', data });
  },

  async cancel(req: Request, res: Response) {
    const data = await membershipService.cancel(callerOf(req), idOf(res));
    res.json({ success: true, message: 'Membership cancelled.', data });
  },

  async listMine(req: Request, res: Response) {
    const { data, meta } = await membershipService.listMine(
      callerOf(req),
      res.locals.query as MyMembershipsQuery,
    );
    res.json({ success: true, data, meta });
  },

  async adminList(req: Request, res: Response) {
    const { data, meta } = await membershipService.adminList(
      callerOf(req),
      res.locals.query as AdminMembershipListQuery,
    );
    res.json({ success: true, data, meta });
  },

  /** The gateway gets the same answer whatever happened, so the outcome reveals nothing. */
  async ipn(req: Request, res: Response) {
    const outcome = await paymentService.handleIpn(req.body as PaymentIpnInput);
    logger.info(`payment IPN: ${outcome}`);
    res.json({ success: true, data: { received: true } });
  },
};
