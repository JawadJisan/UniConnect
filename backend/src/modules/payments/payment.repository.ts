import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../repositories/audit.repository.js';

export const paymentRepository = {
  create(
    db: Db,
    data: { userId: string; membershipId: number; amount: string; transactionId: string },
  ) {
    return db.paymentTransaction.create({
      data: {
        userId: data.userId,
        clubMembershipId: data.membershipId,
        amount: data.amount,
        currency: 'BDT',
        transactionId: data.transactionId,
        paymentStatus: 'pending',
      },
      select: { id: true, transactionId: true },
    });
  },

  /** Everything the IPN handler needs: the stored amount, the membership and the receipt data. */
  findByTransactionId(db: Db, transactionId: string) {
    return db.paymentTransaction.findUnique({
      where: { transactionId },
      select: {
        id: true,
        transactionId: true,
        amount: true,
        currency: true,
        paymentStatus: true,
        clubMembershipId: true,
        user: { select: { name: true, email: true } },
        membership: { select: { club: { select: { name: true } } } },
      },
    });
  },

  /**
   * Settles a pending payment. Guarded by `payment_status = 'pending'`, so a duplicate or
   * concurrent IPN updates nothing (PRD FR-MEM-001 step 3). Returns the number of rows changed.
   */
  async settle(
    db: Db,
    transactionId: string,
    data: {
      paymentStatus: 'completed' | 'failed';
      valId?: string | null;
      bankTranId?: string | null;
      paymentMethod?: string | null;
      validatedAt?: Date | null;
      gatewayResponse?: Prisma.InputJsonValue;
    },
  ): Promise<number> {
    const { count } = await db.paymentTransaction.updateMany({
      where: { transactionId, paymentStatus: 'pending' },
      data: {
        paymentStatus: data.paymentStatus,
        ...(data.valId !== undefined && { valId: data.valId }),
        ...(data.bankTranId !== undefined && { bankTranId: data.bankTranId }),
        ...(data.paymentMethod !== undefined && { paymentMethod: data.paymentMethod }),
        ...(data.validatedAt !== undefined && { validatedAt: data.validatedAt }),
        ...(data.gatewayResponse !== undefined && {
          paymentGatewayResponse: data.gatewayResponse,
        }),
      },
    });
    return count;
  },

  /** Fails every pending payment of the given memberships (cancel, stale cleanup). */
  async failPendingFor(db: Db, membershipIds: number[]): Promise<number> {
    const { count } = await db.paymentTransaction.updateMany({
      where: { clubMembershipId: { in: membershipIds }, paymentStatus: 'pending' },
      data: { paymentStatus: 'failed' },
    });
    return count;
  },
};
