import { z } from 'zod';
import { AUDIT_ACTIONS, type AuditAction } from '../constants/index.js';
import { isoDateSchema } from './dept-admin-term.js';
import { roleSchema } from './enums.js';
import { paginationQueryShape } from './pagination.js';

// Audit log viewer (PRD FR-AUDIT-002; DECISIONS D42).

export const AUDIT_ACTION_VALUES = Object.values(AUDIT_ACTIONS) as [AuditAction, ...AuditAction[]];

export const FROM_AFTER_TO = 'The start date must be on or before the end date.';

/**
 * GET /api/v1/admin/audit-logs. `from` and `to` are calendar days in Asia/Dhaka, both
 * inclusive. `action` must be a known action; `entity_type` is matched exactly.
 */
export const auditLogQuerySchema = z
  .object({
    ...paginationQueryShape,
    user_id: z.uuid('Not a valid user id.').optional(),
    action: z.enum(AUDIT_ACTION_VALUES, 'Not a known audit action.').optional(),
    entity_type: z
      .string()
      .trim()
      .min(1)
      .max(50, 'Entity type must be at most 50 characters.')
      .optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .strict()
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: FROM_AFTER_TO, path: ['from'] });

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type AuditLogParams = z.input<typeof auditLogQuerySchema>;

/** One audit row. The actor is name and role only, never email; null means the system. */
export const auditLogEntrySchema = z.object({
  id: z.number().int().positive(),
  action: z.string(),
  entity_type: z.string().nullable(),
  entity_id: z.string().nullable(),
  old_value: z.unknown().nullable(),
  new_value: z.unknown().nullable(),
  ip_address: z.string().nullable(),
  created_at: z.string(),
  actor: z.object({ id: z.string(), name: z.string(), role: roleSchema }).nullable(),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
