import {
  AUDIT_ACTIONS,
  paginationMeta,
  type Announcement,
  type AnnouncementListQuery,
  type AuditAction,
  type CreateAnnouncementInput,
  type Paginated,
  type UpdateAnnouncementInput,
} from '@uniconnect/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import type { Db } from '../../repositories/audit.repository.js';
import { auditService } from '../../services/audit.service.js';
import { committeeRepository } from '../committee/committee.repository.js';
import {
  PIN_ROLES,
  canCreateWith,
  canManageWith,
  canPinWith,
  canSeeWith,
  visibleScope,
  type AnnouncementCaller,
  type CreateTarget,
} from './announcement.access.js';
import { toAnnouncement, toFacts } from './announcement.mapper.js';
import {
  announcementRepository as repo,
  whereVisible,
  type AnnouncementRow,
} from './announcement.repository.js';

// FR-ANNOUNCE-001–004 (DECISIONS D15, D38). One transaction per change, with its audit row.

const NOT_FOUND = () => new AppError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found.');
const MANAGE_FORBIDDEN = () =>
  new AppError(403, 'ANNOUNCEMENT_FORBIDDEN', "You can't change this announcement.");
const PIN_FORBIDDEN = () =>
  new AppError(403, 'PIN_FORBIDDEN', 'Only a department admin or a super admin can pin.');

function flagsFor(caller: AnnouncementCaller, row: AnnouncementRow, seatInClub: boolean) {
  const facts = toFacts(row);
  return {
    canManage: canManageWith(caller, facts, seatInClub),
    canPin: canPinWith(caller, facts),
  };
}

const seatFor = (caller: AnnouncementCaller, row: AnnouncementRow, db: Db) =>
  caller.role === 'moderator' && row.clubId !== null
    ? committeeRepository.hasCurrentPosition(db, caller.id, row.clubId)
    : Promise.resolve(false);

/**
 * Locks the row, then loads it as the caller may see it. Not visible: 404, so another
 * department's or club's posts aren't revealed. Returns the moderator's current seat too.
 */
async function lockVisible(tx: Db, caller: AnnouncementCaller, id: number) {
  if (!(await repo.lock(tx, id))) throw NOT_FOUND();
  const row = await repo.findById(tx, id);
  if (!row) throw NOT_FOUND();
  if (!canSeeWith(toFacts(row), await visibleScope(tx, caller))) throw NOT_FOUND();
  return { row, seat: await seatFor(caller, row, tx) };
}

function audit(
  tx: Db,
  caller: AnnouncementCaller,
  action: AuditAction,
  id: number,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
) {
  return auditService.record(tx, {
    userId: caller.id,
    action,
    entityType: 'announcement',
    entityId: id,
    ...(oldValue === null ? {} : { oldValue: oldValue as Prisma.InputJsonValue }),
    ...(newValue === null ? {} : { newValue: newValue as Prisma.InputJsonValue }),
    ipAddress: caller.ip,
  });
}

const snapshot = (row: AnnouncementRow) => ({
  title: row.title,
  content: row.content,
  club_id: row.clubId,
  department_id: row.departmentId,
  author_id: row.authorId,
  is_pinned: row.isPinned,
  created_at: row.createdAt.toISOString(),
});

export const announcementService = {
  /** FR-ANNOUNCE-001. */
  async create(caller: AnnouncementCaller, input: CreateAnnouncementInput): Promise<Announcement> {
    if (input.is_pinned === true && !PIN_ROLES.includes(caller.role)) throw PIN_FORBIDDEN();
    return prisma.$transaction(async (tx) => {
      let target: CreateTarget;
      if (input.club_id !== undefined) {
        const club = await repo.findClub(tx, input.club_id);
        if (!club) throw new AppError(404, 'CLUB_NOT_FOUND', 'Club not found.');
        target = { kind: 'club', clubId: club.id, clubDepartmentId: club.departmentId };
      } else {
        const dept = await repo.findDepartment(tx, input.department_id!);
        if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Department not found.');
        target = { kind: 'department', departmentId: dept.id };
      }
      const seat =
        caller.role === 'moderator' && target.kind === 'club'
          ? await committeeRepository.hasCurrentPosition(tx, caller.id, target.clubId)
          : false;
      if (!canCreateWith(caller, target, seat)) {
        throw new AppError(
          403,
          'ANNOUNCEMENT_SCOPE_FORBIDDEN',
          caller.role === 'moderator'
            ? 'You can post only to a club where you hold a committee position.'
            : 'You can post only to your own department or its club.',
        );
      }

      const row = await repo.create(tx, {
        title: input.title,
        content: input.content,
        clubId: target.kind === 'club' ? target.clubId : null,
        departmentId: target.kind === 'department' ? target.departmentId : null,
        authorId: caller.id,
        isPinned: input.is_pinned ?? false,
      });
      await audit(tx, caller, AUDIT_ACTIONS.ANNOUNCEMENT_CREATED, row.id, null, {
        title: row.title,
        scope: row.clubId !== null ? 'club' : 'department',
        club_id: row.clubId,
        department_id: row.departmentId,
        is_pinned: row.isPinned,
      });
      return toAnnouncement(row, flagsFor(caller, row, seat));
    });
  },

  /** FR-ANNOUNCE-002: the D15 feed, pinned first, then newest. */
  async list(
    caller: AnnouncementCaller,
    q: AnnouncementListQuery,
  ): Promise<Paginated<Announcement>> {
    const scope = await visibleScope(prisma, caller);
    const where = whereVisible(scope, q);
    const [rows, total] = await Promise.all([
      repo.list(prisma, where, (q.page - 1) * q.limit, q.limit),
      repo.count(prisma, where),
    ]);
    const data = rows.map((row) =>
      toAnnouncement(
        row,
        flagsFor(caller, row, row.clubId !== null && scope.seatClubIds.includes(row.clubId)),
      ),
    );
    return { data, meta: paginationMeta(q.page, q.limit, total) };
  },

  /** FR-ANNOUNCE-003. Title and content only; changed fields only, and a no-op writes nothing. */
  async update(
    caller: AnnouncementCaller,
    id: number,
    input: UpdateAnnouncementInput,
  ): Promise<Announcement> {
    return prisma.$transaction(async (tx) => {
      const { row, seat } = await lockVisible(tx, caller, id);
      if (!canManageWith(caller, toFacts(row), seat)) throw MANAGE_FORBIDDEN();

      const changed: { title?: string; content?: string } = {};
      if (input.title !== undefined && input.title !== row.title) changed.title = input.title;
      if (input.content !== undefined && input.content !== row.content) {
        changed.content = input.content;
      }
      if (Object.keys(changed).length === 0)
        return toAnnouncement(row, flagsFor(caller, row, seat));

      const updated = await repo.update(tx, id, changed);
      const old = Object.fromEntries(
        Object.keys(changed).map((k) => [k, row[k as keyof typeof changed]]),
      );
      await audit(tx, caller, AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED, id, old, changed);
      return toAnnouncement(updated, flagsFor(caller, updated, seat));
    });
  },

  /** FR-ANNOUNCE-003. A hard delete; the audit row keeps a snapshot. */
  async remove(caller: AnnouncementCaller, id: number): Promise<{ id: number }> {
    return prisma.$transaction(async (tx) => {
      const { row, seat } = await lockVisible(tx, caller, id);
      if (!canManageWith(caller, toFacts(row), seat)) throw MANAGE_FORBIDDEN();
      await repo.delete(tx, id);
      await audit(tx, caller, AUDIT_ACTIONS.ANNOUNCEMENT_DELETED, id, snapshot(row), null);
      return { id };
    });
  },

  /** FR-ANNOUNCE-004. Flips `is_pinned` atomically. */
  async togglePin(caller: AnnouncementCaller, id: number): Promise<Announcement> {
    return prisma.$transaction(async (tx) => {
      const { row, seat } = await lockVisible(tx, caller, id);
      if (!canPinWith(caller, toFacts(row))) throw PIN_FORBIDDEN();
      const pinned = await repo.togglePin(tx, id);
      await audit(
        tx,
        caller,
        pinned ? AUDIT_ACTIONS.ANNOUNCEMENT_PINNED : AUDIT_ACTIONS.ANNOUNCEMENT_UNPINNED,
        id,
        { is_pinned: !pinned },
        { is_pinned: pinned },
      );
      const updated = { ...row, isPinned: pinned };
      return toAnnouncement(updated, flagsFor(caller, updated, seat));
    });
  },
};
