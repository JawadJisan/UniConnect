import type { AuditLogQuery } from '@uniconnect/shared';
import type { Request, Response } from 'express';
import { auditLogService } from './audit-log.service.js';

export const auditLogController = {
  /** FR-AUDIT-002. The query was parsed by validateRequest into res.locals. */
  async list(_req: Request, res: Response) {
    const { data, meta } = await auditLogService.list(res.locals.query as AuditLogQuery);
    res.json({ success: true, data, meta });
  },
};
