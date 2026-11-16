import {
  paginationMeta,
  type AuditLogEntry,
  type AuditLogQuery,
  type Paginated,
  type Role,
} from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { addDays } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { auditLogRepository, type AuditLogRow } from './audit-log.repository.js';

// FR-AUDIT-002 (DECISIONS D42): super admins read the audit log. Read-only; writes no audit row.

/** The instant a Dhaka calendar day starts. Asia/Dhaka is UTC+6 all year (no DST). */
export const dhakaDayStart = (day: string) => new Date(`${day}T00:00:00+06:00`);

/**
 * `from` and `to` are Dhaka days, both inclusive: `from` starts at that day's 00:00 Dhaka,
 * and `to` ends where the next Dhaka day starts (exclusive).
 */
export function createdAtRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: dhakaDayStart(from) } : {}),
    ...(to ? { lt: dhakaDayStart(addDays(to, 1)) } : {}),
  };
}

export function whereAuditLogs(q: AuditLogQuery): Prisma.AuditLogWhereInput {
  const createdAt = createdAtRange(q.from, q.to);
  return {
    ...(q.user_id !== undefined ? { userId: q.user_id } : {}),
    ...(q.action !== undefined ? { action: q.action } : {}),
    ...(q.entity_type !== undefined ? { entityType: q.entity_type } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

/** The API shape: values as stored (never passwords or tokens, by the write rules). */
export function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    action: row.action,
    entity_type: row.entityType,
    entity_id: row.entityId,
    old_value: row.oldValue ?? null,
    new_value: row.newValue ?? null,
    ip_address: row.ipAddress,
    created_at: row.createdAt.toISOString(),
    actor: row.user ? { id: row.user.id, name: row.user.name, role: row.user.role as Role } : null,
  };
}

export const auditLogService = {
  async list(q: AuditLogQuery): Promise<Paginated<AuditLogEntry>> {
    const where = whereAuditLogs(q);
    const [rows, total] = await Promise.all([
      auditLogRepository.list(prisma, where, (q.page - 1) * q.limit, q.limit),
      auditLogRepository.count(prisma, where),
    ]);
    return { data: rows.map(toAuditLogEntry), meta: paginationMeta(q.page, q.limit, total) };
  },

  /** The last `n` entries, for the super admin dashboard. */
  async latest(n: number): Promise<AuditLogEntry[]> {
    const rows = await auditLogRepository.list(prisma, {}, 0, n);
    return rows.map(toAuditLogEntry);
  },
};
