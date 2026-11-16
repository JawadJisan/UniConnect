import type { Announcement } from '@uniconnect/shared';
import type { AnnouncementFacts } from './announcement.access.js';
import type { AnnouncementRow } from './announcement.repository.js';

export const toFacts = (row: AnnouncementRow): AnnouncementFacts => ({
  clubId: row.clubId,
  departmentId: row.departmentId,
  clubDepartmentId: row.club?.departmentId ?? null,
  authorId: row.authorId,
});

/** The API shape (D38). Only the author's id and name: never their email. */
export function toAnnouncement(
  row: AnnouncementRow,
  flags: { canManage: boolean; canPin: boolean },
): Announcement {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    is_pinned: row.isPinned,
    scope: row.clubId !== null ? 'club' : 'department',
    club: row.club ? { id: row.club.id, name: row.club.name } : null,
    department: row.department ? { id: row.department.id, name: row.department.name } : null,
    author: { id: row.author.id, name: row.author.name },
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    can_manage: flags.canManage,
    can_pin: flags.canPin,
  };
}
