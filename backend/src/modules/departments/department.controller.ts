import type { Request, Response } from 'express';
import { departmentService } from './department.service.js';

export const departmentController = {
  async list(_req: Request, res: Response) {
    res.json({ success: true, data: await departmentService.list() });
  },
};
