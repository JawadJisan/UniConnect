import {
  AUDIT_ACTIONS,
  paginationMeta,
  type CreateDonationInput,
  type Donation,
  type Donor,
  type DonorListQuery,
  type MyDonationsQuery,
  type Paginated,
  type UnverifiedDonation,
  type UnverifiedDonationsQuery,
} from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { fromDbDate, toDbDate, todayInDhaka } from '../../lib/dates.js';
import { AppError } from '../../lib/http-error.js';
import { isLockWait } from '../../lib/prisma-errors.js';
import { prisma } from '../../lib/prisma.js';
import { roleRepository } from '../../repositories/role.repository.js';
import { auditService } from '../../services/audit.service.js';
import {
  BLOOD_BUSY,
  toDonation,
  toDonor,
  toUnverifiedDonation,
  type BloodCaller,
} from './blood.mapper.js';
import { donationRepository as repo, whereDonor } from './donation.repository.js';

// FR-BLOOD-001–004 and -010 (DECISIONS D14, D40).

const NOT_FOUND = () => new AppError(404, 'DONATION_NOT_FOUND', 'Donation not found.');

/** Separate lock waits from real failures, as events do (D36). */
const VERIFY_TX = { maxWait: 15_000, timeout: 25_000 };

export const donationService = {
  /** FR-BLOOD-001: an unverified record; `last_donation_date` is untouched. */
  async create(caller: BloodCaller, input: CreateDonationInput): Promise<Donation> {
    if (input.donation_date > todayInDhaka()) {
      throw new AppError(400, 'DONATION_DATE_FUTURE', 'The donation date cannot be in the future.');
    }
    const user = await repo.findUserBlood(prisma, caller.id);
    if (!user?.bloodGroup) {
      throw new AppError(400, 'BLOOD_GROUP_MISSING', 'Set your blood group on your profile first.');
    }
    const row = await prisma.$transaction((tx) =>
      repo.create(tx, {
        userId: caller.id,
        bloodGroup: user.bloodGroup!,
        donationDate: toDbDate(input.donation_date),
        units: input.units,
        hospitalName: input.hospital_name ?? null,
        notes: input.notes ?? null,
      }),
    );
    return toDonation(row);
  },

  /** FR-BLOOD-003. Newest first. */
  async listMine(caller: BloodCaller, q: MyDonationsQuery): Promise<Paginated<Donation>> {
    const [rows, total] = await Promise.all([
      repo.listMine(prisma, caller.id, (q.page - 1) * q.limit, q.limit),
      repo.countMine(prisma, caller.id),
    ]);
    return { data: rows.map(toDonation), meta: paginationMeta(q.page, q.limit, total) };
  },

  /**
   * FR-BLOOD-002, one transaction. Lock order user → donation (as D12): two verifications of
   * the same donor run in turn, so `last_donation_date` always ends on the latest verified date.
   */
  async verify(caller: BloodCaller, id: number): Promise<Donation> {
    try {
      return await donationService.verifyTx(caller, id);
    } catch (err) {
      if (isLockWait(err)) throw BLOOD_BUSY();
      throw err;
    }
  },

  verifyTx(caller: BloodCaller, id: number): Promise<Donation> {
    return prisma.$transaction(async (tx) => {
      const facts = await repo.findDonorFacts(tx, id);
      if (!facts) throw NOT_FOUND();
      // Another department's donation is invisible to a dept_admin: 404, as in D36 and D38.
      if (caller.role !== 'super_admin' && facts.donor.departmentId !== caller.departmentId) {
        throw NOT_FOUND();
      }
      if (facts.userId === caller.id) {
        throw new AppError(
          403,
          'CANNOT_VERIFY_OWN_DONATION',
          "You can't verify your own donation. Another admin has to.",
        );
      }

      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '15s'`);
      await roleRepository.lockUser(tx, facts.userId);
      const locked = await repo.lock(tx, id);
      if (!locked) throw NOT_FOUND();
      if (locked.verified) {
        throw new AppError(409, 'DONATION_ALREADY_VERIFIED', 'This donation is already verified.');
      }

      const row = await repo.markVerified(tx, id, caller.id, new Date());
      // Separate statements after the locks, so they see every verification committed before.
      const before = await repo.findUserBlood(tx, facts.userId);
      const latest = await repo.latestVerifiedDate(tx, facts.userId);
      await repo.setLastDonationDate(tx, facts.userId, latest);

      await auditService.record(tx, {
        userId: caller.id,
        action: AUDIT_ACTIONS.BLOOD_DONATION_VERIFIED,
        entityType: 'blood_donation',
        entityId: id,
        oldValue: {
          verified: false,
          last_donation_date: before?.lastDonationDate ? fromDbDate(before.lastDonationDate) : null,
        },
        newValue: {
          verified: true,
          donor_id: facts.userId,
          donation_date: fromDbDate(row.donationDate),
          last_donation_date: latest ? fromDbDate(latest) : null,
        },
        ipAddress: caller.ip,
      });
      return toDonation(row);
    }, VERIFY_TX);
  },

  /** FR-BLOOD-010. A dept_admin sees only their department; another one is an empty page. */
  async listUnverified(
    caller: BloodCaller,
    q: UnverifiedDonationsQuery,
  ): Promise<Paginated<UnverifiedDonation>> {
    let departmentId = q.department_id;
    if (caller.role !== 'super_admin') {
      if (departmentId !== undefined && departmentId !== caller.departmentId) {
        return { data: [], meta: paginationMeta(q.page, q.limit, 0) };
      }
      departmentId = caller.departmentId ?? -1;
    }
    const where: Prisma.BloodDonationWhereInput = {
      verified: false,
      ...(departmentId !== undefined ? { donor: { departmentId } } : {}),
    };
    const [rows, total] = await Promise.all([
      repo.listUnverified(prisma, where, (q.page - 1) * q.limit, q.limit),
      repo.countUnverified(prisma, where),
    ]);
    return { data: rows.map(toUnverifiedDonation), meta: paginationMeta(q.page, q.limit, total) };
  },

  /** FR-BLOOD-004. Most recent verified donors first; phone shown, email never (D14). */
  async listDonors(q: DonorListQuery): Promise<Paginated<Donor>> {
    const where = whereDonor(q);
    const [rows, total] = await Promise.all([
      repo.listDonors(prisma, where, (q.page - 1) * q.limit, q.limit),
      repo.countDonors(prisma, where),
    ]);
    const verified = q.verified_only
      ? new Set(rows.map((r) => r.id))
      : await repo.verifiedDonorIds(
          prisma,
          rows.map((r) => r.id),
        );
    return {
      data: rows.map((r) => toDonor(r, verified.has(r.id))),
      meta: paginationMeta(q.page, q.limit, total),
    };
  },
};
