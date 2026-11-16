import type { Request, Response } from 'express';
import { callerOf } from './dashboard.caller.js';
import { personalService } from './personal.service.js';
import {
  deptAdminDashboardService,
  moderatorDashboardService,
  superAdminDashboardService,
} from './role.services.js';

export const dashboardController = {
  async personal(req: Request, res: Response) {
    res.json({ success: true, data: await personalService.get(callerOf(req)) });
  },

  async moderator(req: Request, res: Response) {
    res.json({ success: true, data: await moderatorDashboardService.get(callerOf(req)) });
  },

  async deptAdmin(req: Request, res: Response) {
    res.json({ success: true, data: await deptAdminDashboardService.get(callerOf(req)) });
  },

  async superAdmin(req: Request, res: Response) {
    callerOf(req);
    res.json({ success: true, data: await superAdminDashboardService.get() });
  },
};
