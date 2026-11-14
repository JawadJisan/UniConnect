import {
  committeeListQuerySchema,
  eventListQuerySchema,
  EVENT_STATUSES,
  ROLES,
  type CommitteeEntry,
  type DeptAdminDashboard,
  type ModeratorDashboard,
  type SuperAdminDashboard,
} from '@uniconnect/shared';
import { fromDbDate, toDbDate, todayInDhaka } from '../../lib/dates.js';
import { checkHealth } from '../../lib/health.js';
import { AppError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { queueHealth } from '../../lib/queue-health.js';
import { auditLogService } from '../audit-logs/audit-log.service.js';
import { committeeService } from '../committee/committee.service.js';
import { eventService } from '../events/event.service.js';
import { countsBy, daysBetween, dhakaMonth, type DashboardCaller } from './dashboard.caller.js';
import { dashboardRepository as repo } from './dashboard.repository.js';

// FR-DASH-002–004 (DECISIONS D42). Department-scoped figures always take the caller's
// department (tenant isolation); lists with a visibility rule come from their own services.

const CURRENT_COMMITTEE = committeeListQuerySchema.parse({ is_current: 'true', limit: 100 });

const byKey = <T extends { _count: { _all: number } }>(rows: T[], key: (r: T) => string | null) =>
  rows.map((r) => ({ key: key(r), count: r._count._all }));

async function currentCommittee(clubId: number): Promise<CommitteeEntry[]> {
  return (await committeeService.list(clubId, CURRENT_COMMITTEE)).data;
}

/** FR-DASH-002: the club where the moderator holds a current committee seat. */
export const moderatorDashboardService = {
  async get(caller: DashboardCaller): Promise<ModeratorDashboard> {
    const seat = await repo.seatClub(prisma, caller.id);
    if (!seat) {
      throw new AppError(
        404,
        'NO_COMMITTEE_SEAT',
        "You don't hold a current committee position. Ask your department admin to check your role.",
      );
    }
    const club = seat.club;
    const now = new Date();
    const today = toDbDate(todayInDhaka(now));
    const [upcoming, registrations, members, drafts, recent, committee] = await Promise.all([
      repo.upcomingPublishedCount(prisma, club.id, now),
      repo.upcomingRegistrationsCount(prisma, club.id, now),
      repo.activeMemberships(prisma, today, club.id),
      // The events list shows drafts only to organizers; the seat makes the caller one (D36).
      eventService.list(
        caller,
        eventListQuerySchema.parse({ status: 'draft', club_id: club.id, limit: 10 }),
      ),
      repo.recentRegistrations(prisma, club.id, now, 10),
      currentCommittee(club.id),
    ]);
    return {
      club,
      stats: {
        upcoming_events: upcoming,
        upcoming_registrations: registrations,
        active_members: members,
      },
      drafts: drafts.data,
      recent_registrations: recent.map((r) => ({
        id: r.id,
        status: r.status,
        registered_at: r.registeredAt.toISOString(),
        user: { id: r.user.id, name: r.user.name, student_id: r.user.studentId },
        event: {
          id: r.event.id,
          title: r.event.title,
          start_date: r.event.startDate.toISOString(),
        },
      })),
      committee,
    };
  },
};

/** FR-DASH-003: everything scoped to the caller's department. */
export const deptAdminDashboardService = {
  async get(caller: DashboardCaller): Promise<DeptAdminDashboard> {
    const departmentId = caller.departmentId;
    const department = departmentId === null ? null : await repo.department(prisma, departmentId);
    if (departmentId === null || !department) {
      throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'Your department was not found.');
    }
    const todayIso = todayInDhaka();
    const today = toDbDate(todayIso);
    const month = dhakaMonth(todayIso);
    const club = department.club;

    const [roles, events, pending, members, posts, committee, term] = await Promise.all([
      repo.usersByRole(prisma, departmentId),
      club ? repo.eventsByStatus(prisma, { clubId: club.id, ...month }) : Promise.resolve([]),
      repo.pendingBloodVerifications(prisma, departmentId),
      club ? repo.activeMemberships(prisma, today, club.id) : Promise.resolve(0),
      repo.announcementsIn(prisma, departmentId, month.from, month.to),
      club ? currentCommittee(club.id) : Promise.resolve([]),
      repo.currentAdminTerm(prisma, caller.id, departmentId),
    ]);

    const byStatus = countsBy(
      EVENT_STATUSES,
      byKey(events, (r) => r.status),
    );
    const termEnd = term ? fromDbDate(term.endDate) : null;
    return {
      department: { id: department.id, name: department.name },
      users_by_role: countsBy(
        ROLES,
        byKey(roles, (r) => r.role),
      ),
      events_this_month: {
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        by_status: byStatus,
      },
      pending_blood_verifications: pending,
      active_memberships: members,
      announcements_this_month: posts,
      committee: { vacant: committee.length === 0, current: committee },
      admin_term:
        term && termEnd
          ? {
              id: term.id,
              start_date: fromDbDate(term.startDate),
              end_date: termEnd,
              days_left: Math.max(0, daysBetween(todayIso, termEnd)),
            }
          : null,
    };
  },
};

/** FR-DASH-004: global figures, the latest audit rows and system health. */
export const superAdminDashboardService = {
  async get(): Promise<SuperAdminDashboard> {
    const today = toDbDate(todayInDhaka());
    const [
      roles,
      perDept,
      departments,
      events,
      members,
      revenue,
      fulfilled,
      audit,
      terms,
      health,
      queues,
    ] = await Promise.all([
      repo.usersByRole(prisma),
      repo.usersByDepartment(prisma),
      repo.departments(prisma),
      repo.eventsByStatus(prisma),
      repo.activeMemberships(prisma, today),
      repo.revenue(prisma),
      repo.fulfilledBloodRequests(prisma),
      auditLogService.latest(10),
      repo.currentAdminTerms(prisma),
      checkHealth(),
      queueHealth(),
    ]);
    const deptCounts = new Map(perDept.map((r) => [r.departmentId, r._count._all]));
    return {
      users_by_role: countsBy(
        ROLES,
        byKey(roles, (r) => r.role),
      ),
      users_by_department: departments.map((d) => ({ ...d, count: deptCounts.get(d.id) ?? 0 })),
      events_by_status: countsBy(
        EVENT_STATUSES,
        byKey(events, (r) => r.status),
      ),
      active_memberships: members,
      // Decimal → fixed 2-decimal string; never through a JS number (CLAUDE.md "Money").
      revenue: { amount: revenue ? revenue.toFixed(2) : '0.00', currency: 'BDT' },
      fulfilled_blood_requests: fulfilled,
      recent_audit: audit,
      dept_admin_terms: terms.map((t) => ({
        id: t.id,
        start_date: fromDbDate(t.startDate),
        end_date: fromDbDate(t.endDate),
        user: t.user,
        department: t.department,
      })),
      health: { ...health, queues },
    };
  },
};
