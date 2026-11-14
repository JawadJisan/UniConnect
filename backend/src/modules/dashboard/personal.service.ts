import {
  announcementListQuerySchema,
  bloodRequestListQuerySchema,
  eventListQuerySchema,
  myMembershipsQuerySchema,
  type BloodGroup,
  type PersonalDashboard,
} from '@uniconnect/shared';
import { todayInDhaka } from '../../lib/dates.js';
import { announcementService } from '../announcements/announcement.service.js';
import { requestService } from '../blood/request.service.js';
import { eventService } from '../events/event.service.js';
import { membershipService } from '../memberships/membership.service.js';
import { daysBetween, type DashboardCaller } from './dashboard.caller.js';

// FR-DASH-001, the personal view (D13 resolved 2026-11-14: every student and faculty account,
// whatever its role). Each list comes from its module's own service, so the visibility rules
// (D36 events, D15 announcements) have one source.

/** Phase 9 (chatbot) isn't built; turn this on with it. */
export const CHATBOT_ENABLED = false;

const LATEST = 5;

export const personalService = {
  async get(caller: DashboardCaller): Promise<PersonalDashboard> {
    const [events, announcements, blood, membership] = await Promise.all([
      // `upcoming` = published and not started yet. Without a status the list applies no
      // status filter at all, so past and completed events would show here.
      eventService.list(caller, eventListQuerySchema.parse({ status: 'upcoming', limit: LATEST })),
      announcementService.list(caller, announcementListQuerySchema.parse({ limit: LATEST })),
      bloodRequestsFor(caller),
      membershipFor(caller),
    ]);
    return {
      upcoming_events: events.data,
      membership,
      announcements: announcements.data,
      blood_requests: blood,
      chatbot: { enabled: CHATBOT_ENABLED },
    };
  },
};

/** Pending requests for the caller's group, soonest first. Their own are left out (D40). */
async function bloodRequestsFor(caller: DashboardCaller) {
  if (!caller.bloodGroup) return [];
  const page = await requestService.list(
    caller,
    bloodRequestListQuerySchema.parse({
      status: 'pending',
      blood_group: caller.bloodGroup as BloodGroup,
      limit: LATEST * 2,
    }),
  );
  return page.data.filter((r) => r.requester.id !== caller.id).slice(0, LATEST);
}

/** Students only (PRD §5): the active membership and a scheduled renewal, if any. */
async function membershipFor(caller: DashboardCaller): Promise<PersonalDashboard['membership']> {
  if (caller.userType !== 'student') return null;
  const mine = await membershipService.listMine(
    caller,
    myMembershipsQuerySchema.parse({ limit: 10 }),
  );
  const current = mine.data.find((m) => m.status === 'active') ?? null;
  const scheduled = mine.data.find((m) => m.status === 'scheduled') ?? null;
  return {
    current,
    scheduled,
    days_left: current ? Math.max(0, daysBetween(todayInDhaka(), current.end_date)) : null,
  };
}
