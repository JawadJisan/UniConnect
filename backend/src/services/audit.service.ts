import type { AuditAction } from '@uniconnect/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { auditRepository, type Db } from '../repositories/audit.repository.js';

export interface AuditEntry {
  /** NULL means a system actor (cron job, payment IPN). */
  userId: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string | number;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

// Postgres INET rejects anything that isn't an address, and a bad value would roll back the
// change being audited. Keep only plain IPv4/IPv6 text.
function toInet(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const value = ip.replace(/^::ffff:/, '').trim();
  return /^[0-9a-fA-F:.]+$/.test(value) && value.length <= 45 ? value : null;
}

export const auditService = {
  /**
   * Writes one audit row. Pass the transaction client of the change being recorded, so both
   * commit or roll back together.
   */
  record(db: Db, entry: AuditEntry) {
    return auditRepository.create(db, {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId === undefined ? null : String(entry.entityId),
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      ipAddress: toInet(entry.ipAddress),
    });
  },
};
