import type {
  BloodRequestListQuery,
  CreateBloodRequestInput,
  CreateDonationInput,
  DonorListQuery,
  MyDonationsQuery,
  UnverifiedDonationsQuery,
} from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { unauthorized } from '../../lib/http-error.js';
import type { BloodCaller } from './blood.mapper.js';
import { donationService } from './donation.service.js';
import { requestService } from './request.service.js';

// requireAuth runs before every route here; fail closed if it somehow didn't.
function callerOf(req: Request): BloodCaller {
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

export const bloodController = {
  async createDonation(req: Request, res: Response) {
    const data = await donationService.create(callerOf(req), req.body as CreateDonationInput);
    res.status(201).json({
      success: true,
      message: 'Donation recorded. It counts once an admin verifies it.',
      data,
    });
  },

  async myDonations(req: Request, res: Response) {
    const { data, meta } = await donationService.listMine(
      callerOf(req),
      res.locals.query as MyDonationsQuery,
    );
    res.json({ success: true, data, meta });
  },

  async verifyDonation(req: Request, res: Response) {
    const data = await donationService.verify(callerOf(req), idOf(res));
    res.json({ success: true, message: 'Donation verified.', data });
  },

  async unverifiedDonations(req: Request, res: Response) {
    const { data, meta } = await donationService.listUnverified(
      callerOf(req),
      res.locals.query as UnverifiedDonationsQuery,
    );
    res.json({ success: true, data, meta });
  },

  async donors(req: Request, res: Response) {
    callerOf(req);
    const { data, meta } = await donationService.listDonors(res.locals.query as DonorListQuery);
    res.json({ success: true, data, meta });
  },

  async createRequest(req: Request, res: Response) {
    const data = await requestService.create(callerOf(req), req.body as CreateBloodRequestInput);
    res.status(201).json({ success: true, message: 'Blood request posted.', data });
  },

  async listRequests(req: Request, res: Response) {
    const { data, meta } = await requestService.list(
      callerOf(req),
      res.locals.query as BloodRequestListQuery,
    );
    res.json({ success: true, data, meta });
  },

  async fulfillRequest(req: Request, res: Response) {
    const data = await requestService.fulfill(callerOf(req), idOf(res));
    res.json({ success: true, message: 'Marked as fulfilled. Thank you.', data });
  },

  async cancelRequest(req: Request, res: Response) {
    const data = await requestService.cancel(callerOf(req), idOf(res));
    res.json({ success: true, message: 'Request cancelled.', data });
  },
};
