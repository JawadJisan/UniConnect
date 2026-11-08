import type { Prisma } from '../generated/prisma/client.js';

export type Db = Prisma.TransactionClient;

export const auditRepository = {
  create(db: Db, data: Prisma.AuditLogUncheckedCreateInput) {
    return db.auditLog.create({ data, select: { id: true } });
  },
};
