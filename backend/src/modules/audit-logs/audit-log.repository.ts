import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';

export const AUDIT_LOG_SELECT = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  oldValue: true,
  newValue: true,
  ipAddress: true,
  createdAt: true,
  // The actor's name and role only: never their email (FR-AUDIT-002, D42).
  user: { select: { id: true, name: true, role: true } },
} satisfies Prisma.AuditLogSelect;

export type AuditLogRow = Prisma.AuditLogGetPayload<{ select: typeof AUDIT_LOG_SELECT }>;

/** Newest first; id breaks ties so pages never overlap. */
const ORDER: Prisma.AuditLogOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

export const auditLogRepository = {
  list(db: Db, where: Prisma.AuditLogWhereInput, skip: number, take: number) {
    return db.auditLog.findMany({ where, select: AUDIT_LOG_SELECT, orderBy: ORDER, skip, take });
  },

  count(db: Db, where: Prisma.AuditLogWhereInput) {
    return db.auditLog.count({ where });
  },
};
