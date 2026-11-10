import {
  AUDIT_ACTIONS,
  paginationMeta,
  type ClubDetail,
  type ClubListQuery,
  type ClubSummary,
  type Paginated,
  type UpdateClubInput,
} from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { uploadClubLogo } from '../../lib/cloudinary.js';
import { AppError, badRequest, forbidden } from '../../lib/http-error.js';
import { isAllowedImage } from '../../lib/image.js';
import { prisma } from '../../lib/prisma.js';
import { INVALID_TYPE_MESSAGE } from '../../middleware/upload.js';
import type { Db } from '../../repositories/audit.repository.js';
import { auditService } from '../../services/audit.service.js';
import {
  clubRepository,
  type ClubDetailRow,
  type ClubRow,
  type ClubUpdateData,
} from './club.repository.js';

/** Who is acting: the signed-in user, from req.auth. */
export interface ClubCaller {
  id: string;
  role: string;
  departmentId: number | null;
  ip: string | null;
}

const CLUB_NOT_FOUND = () => new AppError(404, 'CLUB_NOT_FOUND', 'Club not found.');

/** Decimal → "500.00". Money never passes through a JS number (CLAUDE.md, Money). */
const money = (value: Prisma.Decimal | null) => (value === null ? null : value.toFixed(2));

export function toClub(row: ClubRow): ClubSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    logo_url: row.logoUrl,
    membership_fee_monthly: money(row.membershipFeeMonthly),
    membership_fee_yearly: money(row.membershipFeeYearly),
    department: row.department,
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toClubDetail(row: ClubDetailRow): ClubDetail {
  return {
    ...toClub(row),
    committee: row.committeeMembers.map((m) => ({
      id: m.id,
      position: m.position,
      term_start_year: m.termStartYear,
      term_end_year: m.termEndYear,
      user: { id: m.user.id, name: m.user.name, avatar_url: m.user.image },
    })),
  };
}

/** API field → Prisma field. Only these can be written through PATCH /clubs/:id. */
const FIELD_MAP = {
  name: 'name',
  description: 'description',
  membership_fee_monthly: 'membershipFeeMonthly',
  membership_fee_yearly: 'membershipFeeYearly',
} as const satisfies Record<keyof UpdateClubInput, keyof ClubUpdateData>;

type ApiField = keyof typeof FIELD_MAP;

/**
 * Locks the club and checks the caller may edit it. The route's requireDepartmentScope did the
 * same check before the lock; repeating it here keeps the service safe on its own (D31).
 */
async function lockForEdit(tx: Db, caller: ClubCaller, id: number): Promise<ClubRow> {
  if (!(await clubRepository.lockClub(tx, id))) throw CLUB_NOT_FOUND();
  const club = await clubRepository.findForUpdate(tx, id);
  if (!club) throw CLUB_NOT_FOUND();
  if (caller.role !== 'super_admin') {
    if (caller.role !== 'dept_admin' || caller.departmentId !== club.departmentId) {
      throw forbidden();
    }
  }
  return club;
}

export const clubService = {
  async list(q: ClubListQuery): Promise<Paginated<ClubSummary>> {
    const { rows, total } = await clubRepository.list(prisma, q.page, q.limit);
    return { data: rows.map(toClub), meta: paginationMeta(q.page, q.limit, total) };
  },

  async getById(id: number): Promise<ClubDetail> {
    const row = await clubRepository.findDetail(prisma, id);
    if (!row) throw CLUB_NOT_FOUND();
    return toClubDetail(row);
  },

  /** FR-CLUB-002. super_admin has no department, so there is no club to resolve. */
  async getMyClub(caller: ClubCaller): Promise<ClubDetail> {
    if (caller.departmentId === null) {
      throw new AppError(
        404,
        'NO_DEPARTMENT_CLUB',
        'You have no department club. Use GET /api/v1/clubs to browse all clubs.',
      );
    }
    const row = await clubRepository.findDetailByDepartment(prisma, caller.departmentId);
    if (!row) throw CLUB_NOT_FOUND();
    return toClubDetail(row);
  },

  /** FR-CLUB-003. Writes only changed fields; a no-op writes nothing, not even an audit row. */
  async update(caller: ClubCaller, id: number, patch: UpdateClubInput): Promise<ClubDetail> {
    await prisma.$transaction(async (tx) => {
      const before = await lockForEdit(tx, caller, id);
      const current = toClub(before);

      const data: ClubUpdateData = {};
      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      for (const field of Object.keys(patch) as ApiField[]) {
        const next = patch[field];
        if (next === undefined || next === current[field]) continue;
        (data as Record<string, unknown>)[FIELD_MAP[field]] = next;
        oldValue[field] = current[field];
        newValue[field] = next;
      }
      if (Object.keys(data).length === 0) return;

      await clubRepository.update(tx, id, data);
      await auditService.record(tx, {
        userId: caller.id,
        action: AUDIT_ACTIONS.CLUB_UPDATED,
        entityType: 'club',
        entityId: id,
        oldValue: oldValue as Prisma.InputJsonValue,
        newValue: newValue as Prisma.InputJsonValue,
        ipAddress: caller.ip,
      });
    });
    return clubService.getById(id);
  },

  /** DECISIONS D31: the logo changes only here, so only Cloudinary URLs are stored. */
  async updateLogo(caller: ClubCaller, id: number, file: Buffer): Promise<ClubDetail> {
    if (!isAllowedImage(file)) throw badRequest('INVALID_FILE_TYPE', INVALID_TYPE_MESSAGE);

    // Fail before uploading when the caller can't edit this club (the route checked too).
    const departmentId = await clubRepository.findDepartmentId(prisma, id);
    if (departmentId === null) throw CLUB_NOT_FOUND();
    if (caller.role !== 'super_admin' && caller.departmentId !== departmentId) throw forbidden();

    // The upload can't join a transaction. It runs first and the URL is saved after; the
    // public_id is fixed per club, so a failed save leaves no extra file behind.
    const url = await uploadClubLogo(id, file);

    await prisma.$transaction(async (tx) => {
      const before = await lockForEdit(tx, caller, id);
      await clubRepository.update(tx, id, { logoUrl: url });
      await auditService.record(tx, {
        userId: caller.id,
        action: AUDIT_ACTIONS.CLUB_LOGO_UPDATED,
        entityType: 'club',
        entityId: id,
        oldValue: { logo_url: before.logoUrl },
        newValue: { logo_url: url },
        ipAddress: caller.ip,
      });
    });
    return clubService.getById(id);
  },
};
