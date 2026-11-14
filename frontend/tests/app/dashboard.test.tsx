import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  Announcement,
  BloodRequest,
  CommitteeEntry,
  DeptAdminDashboard,
  EventSummary,
  MembershipSummary,
  ModeratorDashboard,
  PersonalDashboard,
  SuperAdminDashboard,
  UserProfile,
} from '@uniconnect/shared';
import { OverviewView } from '@/app/(app)/dashboard/_components/overview-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, studentProfile, superAdminProfile } from './utils';

// The role-adaptive overview (FR-DASH-001–004; D13, D42, D43).

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

// Recharts' ResponsiveContainer measures with ResizeObserver, which jsdom lacks. The chart is
// aria-hidden anyway; the tests read its screen-reader table.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

const get = jest.spyOn(api, 'get');

const CSE = { id: 1, name: 'CSE' };

function event(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 11,
    title: 'CSE Fair',
    description: null,
    organizer_club: { id: 3, name: 'CSE Club' },
    visibility: 'public',
    is_paid: false,
    fee_amount: null,
    start_date: '2026-12-02T08:00:00.000Z',
    end_date: '2026-12-02T11:00:00.000Z',
    venue: 'Hall A',
    max_attendees: null,
    registered_count: 4,
    poster_image_url: null,
    status: 'published',
    departments: [CSE],
    created_at: '2026-11-10T08:00:00.000Z',
    updated_at: '2026-11-10T08:00:00.000Z',
    ...overrides,
  };
}

function membership(overrides: Partial<MembershipSummary> = {}): MembershipSummary {
  return {
    id: 5,
    type: 'monthly',
    status: 'active',
    start_date: '2026-11-04',
    end_date: '2026-12-03',
    created_at: '2026-11-04T08:00:00.000Z',
    club: { id: 3, name: 'CSE Club', logo_url: null, department: CSE },
    payment: null,
    ...overrides,
  };
}

const announcement: Announcement = {
  id: 21,
  title: 'Orientation on Sunday',
  content: 'Hall A at 10.',
  is_pinned: true,
  scope: 'department',
  club: null,
  department: CSE,
  author: { id: 'a1', name: 'Dr. Karim Hossain' },
  created_at: '2026-11-13T08:00:00.000Z',
  updated_at: '2026-11-13T08:00:00.000Z',
  can_manage: false,
  can_pin: false,
};

const bloodRequest: BloodRequest = {
  id: 31,
  patient_name: 'Rahim',
  blood_group: 'B+',
  units_needed: 2,
  reason: null,
  contact_phone: '01700000000',
  hospital_name: 'Dhaka Medical',
  required_by_date: '2026-11-20',
  status: 'pending',
  requester: { id: 'r1', name: 'Nadia', department: CSE },
  fulfiller: null,
  created_at: '2026-11-13T08:00:00.000Z',
  resolved_at: null,
  can_fulfill: true,
  can_cancel: false,
} as BloodRequest;

const committee: CommitteeEntry[] = [
  {
    id: 41,
    club_id: 3,
    position: 'President',
    term_start_year: 2026,
    term_end_year: 2027,
    is_current: true,
    user: { id: 'm1', name: 'Tanvir Ahmed', avatar_url: null },
    updated_at: '2026-11-01T08:00:00.000Z',
  },
];

function personal(overrides: Partial<PersonalDashboard> = {}): PersonalDashboard {
  return {
    upcoming_events: [event()],
    membership: { current: membership(), scheduled: null, days_left: 19 },
    announcements: [announcement],
    blood_requests: [bloodRequest],
    chatbot: { enabled: false },
    ...overrides,
  };
}

const moderatorView: ModeratorDashboard = {
  club: { id: 3, name: 'CSE Club' },
  stats: { upcoming_events: 2, upcoming_registrations: 17, active_members: 40 },
  drafts: [event({ id: 12, title: 'Hack Night', status: 'draft' })],
  recent_registrations: [
    {
      id: 51,
      status: 'registered',
      registered_at: '2026-11-13T09:00:00.000Z',
      user: { id: 's9', name: 'Nusrat Jahan', student_id: 'CSE-22/031' },
      event: { id: 11, title: 'CSE Fair', start_date: '2026-12-02T08:00:00.000Z' },
    },
  ],
  committee,
};

const deptView: DeptAdminDashboard = {
  department: CSE,
  users_by_role: { student: 30, faculty: 6, moderator: 3, dept_admin: 1, super_admin: 0 },
  events_this_month: {
    total: 4,
    by_status: { draft: 1, published: 2, cancelled: 0, completed: 1 },
  },
  pending_blood_verifications: 3,
  active_memberships: 25,
  announcements_this_month: 6,
  committee: { vacant: true, current: [] },
  admin_term: { id: 61, start_date: '2026-01-01', end_date: '2026-12-01', days_left: 17 },
};

const superView: SuperAdminDashboard = {
  users_by_role: { student: 80, faculty: 12, moderator: 6, dept_admin: 3, super_admin: 1 },
  users_by_department: [
    { id: 1, name: 'CSE', count: 50 },
    { id: 2, name: 'ECE', count: 30 },
  ],
  events_by_status: { draft: 2, published: 5, cancelled: 1, completed: 9 },
  active_memberships: 64,
  revenue: { amount: '32500.50', currency: 'BDT' },
  fulfilled_blood_requests: 7,
  recent_audit: [
    {
      id: 900,
      action: 'EVENT_PUBLISHED',
      entity_type: 'Event',
      entity_id: '11',
      old_value: null,
      new_value: null,
      ip_address: '10.0.0.1',
      created_at: '2026-11-14T06:00:00.000Z',
      actor: { id: 'm1', name: 'Tanvir Ahmed', role: 'moderator' },
    },
    {
      id: 899,
      action: 'MEMBERSHIP_EXPIRED',
      entity_type: 'Membership',
      entity_id: '5',
      old_value: null,
      new_value: null,
      ip_address: null,
      created_at: '2026-11-14T00:00:00.000Z',
      actor: null,
    },
  ],
  dept_admin_terms: [
    {
      id: 61,
      start_date: '2026-01-01',
      end_date: '2026-12-01',
      user: { id: 'd1', name: 'Dr. Karim Hossain' },
      department: CSE,
    },
  ],
  health: {
    db: 'ok',
    redis: 'ok',
    queues: [
      { name: 'email', state: 'ok', counts: { waiting: 1, active: 0, delayed: 0, failed: 0 } },
      { name: 'events', state: 'ok', counts: { waiting: 0, active: 0, delayed: 2, failed: 3 } },
      { name: 'blood', state: 'unavailable', counts: null },
    ],
  },
};

type Views = Partial<Record<'student' | 'moderator' | 'dept-admin' | 'super-admin', unknown>>;

/** Serves /users/me and the dashboard views; an Error value is thrown instead. */
function serve(me: UserProfile, views: Views) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    const match = /^\/v1\/dashboard\/(.+)$/.exec(url);
    if (match && match[1]! in views) {
      const value = views[match[1] as keyof Views];
      if (value instanceof Error) throw value;
      return ok(value);
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

const renderOverview = () =>
  renderWithQuery(
    <Workspace>
      <OverviewView />
    </Workspace>,
  );

const requested = () => get.mock.calls.map(([url]) => url);

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset();
});

describe('student', () => {
  it('shows membership, upcoming events, announcements and matching blood requests', async () => {
    serve(studentProfile(), { student: personal() });
    renderOverview();

    const membershipPanel = await screen.findByRole('region', { name: 'Club membership' });
    expect(within(membershipPanel).getByText('CSE Club')).toBeTruthy();
    expect(within(membershipPanel).getByText('19 days left')).toBeTruthy();

    const events = screen.getByRole('region', { name: 'Upcoming events' });
    expect(within(events).getByRole('link', { name: 'CSE Fair' }).getAttribute('href')).toBe(
      '/dashboard/events/11',
    );
    expect(
      within(screen.getByRole('region', { name: 'Latest announcements' })).getByText(
        'Orientation on Sunday',
      ),
    ).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Blood requests for your group' })).getByText(
        '2 units at Dhaka Medical',
      ),
    ).toBeTruthy();

    expect(requested()).not.toContain('/v1/dashboard/moderator');
    expect(requested()).not.toContain('/v1/dashboard/super-admin');
  });

  it('offers a membership when there is none, and shows empty lists plainly', async () => {
    serve(studentProfile(), {
      student: personal({
        membership: { current: null, scheduled: null, days_left: null },
        upcoming_events: [],
        announcements: [],
        blood_requests: [],
      }),
    });
    renderOverview();

    expect(await screen.findByRole('link', { name: 'Become a member' })).toBeTruthy();
    expect(screen.getByText('No upcoming events you can see yet.')).toBeTruthy();
    expect(screen.getByText('No announcements for you yet.')).toBeTruthy();
    expect(screen.getByText('No open requests for your blood group right now.')).toBeTruthy();
  });

  it('asks for a blood group before listing requests', async () => {
    serve(studentProfile({ blood_group: null }), { student: personal({ blood_requests: [] }) });
    renderOverview();
    expect(await screen.findByText(/to see requests you can answer/)).toBeTruthy();
  });

  it('shows the error with a retry, then the view once it loads', async () => {
    let fail = true;
    get.mockImplementation(async (url: string) => {
      if (url === '/v1/users/me') return ok(studentProfile());
      if (url === '/v1/dashboard/student') {
        if (fail) throw axiosError(404, { error: { code: 'NOT_FOUND', message: 'x' } });
        return ok(personal());
      }
      throw new Error(`unexpected GET ${url}`);
    });
    renderOverview();

    expect(await screen.findByText("Couldn't load your overview.")).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Club membership' })).toBeTruthy();
  });

  it('lists what the profile still needs, and hides the checklist once complete', async () => {
    serve(studentProfile({ phone: null }), { student: personal() });
    const { unmount } = renderOverview();
    expect(await screen.findByRole('region', { name: 'Finish your profile' })).toBeTruthy();
    unmount();

    serve(studentProfile({ phone: '01712345678', avatar_url: 'https://x/a.png' }), {
      student: personal(),
    });
    renderOverview();
    await screen.findByRole('region', { name: 'Club membership' });
    expect(screen.queryByRole('region', { name: 'Finish your profile' })).toBeNull();
  });
});

describe('faculty', () => {
  it('gets the personal view without a membership panel', async () => {
    serve(facultyProfile(), { student: personal({ membership: null }) });
    renderOverview();

    expect(await screen.findByRole('region', { name: 'Upcoming events' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Club membership' })).toBeNull();
  });
});

describe('moderator', () => {
  const moderator = () => studentProfile({ role: 'moderator' });

  it('shows the club figures first, then the personal view', async () => {
    serve(moderator(), { moderator: moderatorView, student: personal() });
    renderOverview();

    const club = await screen.findByRole('region', { name: 'CSE Club' });
    expect(within(club).getByText('17')).toBeTruthy();
    expect(within(club).getByRole('link', { name: 'Hack Night' })).toBeTruthy();
    const table = within(club).getByRole('table', { name: 'Recent registrations, newest first' });
    expect(within(table).getByText('Nusrat Jahan')).toBeTruthy();
    expect(within(table).getByText('CSE-22/031')).toBeTruthy();
    expect(within(club).getByText('Tanvir Ahmed')).toBeTruthy();

    const personalSection = await screen.findByRole('region', { name: 'For you' });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf('CSE Club')).toBeLessThan(headings.indexOf('For you'));
    expect(within(personalSection).getByText('CSE Fair')).toBeTruthy();
  });

  it('explains a missing seat instead of failing', async () => {
    serve(moderator(), {
      moderator: axiosError(404, {
        error: { code: 'NO_COMMITTEE_SEAT', message: 'You hold no current committee seat.' },
      }),
      student: personal(),
    });
    renderOverview();

    expect(await screen.findByText("You don't hold a committee seat right now.")).toBeTruthy();
    expect(screen.queryByText("Couldn't load your club's figures.")).toBeNull();
    expect(await screen.findByRole('region', { name: 'For you' })).toBeTruthy();
  });

  it('keeps the personal view when the club view fails', async () => {
    serve(moderator(), {
      moderator: axiosError(403, { error: { code: 'FORBIDDEN', message: 'No.' } }),
      student: personal(),
    });
    renderOverview();

    expect(await screen.findByText("Couldn't load your club's figures.")).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Club membership' })).toBeTruthy();
  });
});

describe('dept admin', () => {
  it('shows the term, department figures, the role chart and a vacant committee', async () => {
    serve(facultyProfile({ role: 'dept_admin', department: CSE }), {
      'dept-admin': deptView,
      student: personal({ membership: null }),
    });
    renderOverview();

    const dept = await screen.findByRole('region', { name: 'CSE department' });
    expect(within(dept).getByText('17 days left')).toBeTruthy();
    const verify = within(dept).getByRole('link', { name: /Blood verifications/ });
    expect(verify.getAttribute('href')).toBe('/dashboard/admin/blood-verifications');
    expect(within(verify).getByText('Waiting for you to verify')).toBeTruthy();
    // 30 + 6 + 3 + 1 active users.
    expect(within(dept).getByText('40')).toBeTruthy();

    const roles = within(dept).getByRole('table', {
      name: 'Active users in your department by role',
    });
    expect(within(roles).getByRole('rowheader', { name: 'Students' })).toBeTruthy();
    expect(within(roles).queryByRole('rowheader', { name: 'Super admins' })).toBeNull();

    expect(within(dept).getByText('Vacant')).toBeTruthy();
    expect(within(dept).getByRole('link', { name: 'Assign a committee' })).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'For you' })).toBeTruthy();
  });
});

describe('super admin', () => {
  it('shows totals, revenue, charts, health, terms and recent activity, and no personal view', async () => {
    serve(superAdminProfile(), { 'super-admin': superView });
    renderOverview();

    const system = await screen.findByRole('region', { name: 'System overview' });
    expect(await within(system).findByText('102')).toBeTruthy();
    // The total links to user management.
    expect(
      within(system)
        .getByRole('link', { name: /Active users/ })
        .getAttribute('href'),
    ).toBe('/dashboard/admin/users');
    expect(within(system).getByText('৳32,500.50')).toBeTruthy();

    const departments = within(system).getByRole('table', { name: 'Active users by department' });
    const rows = within(departments)
      .getAllByRole('rowheader')
      .map((r) => r.textContent);
    expect(rows).toEqual(['CSE', 'ECE']);

    const health = within(system).getByRole('region', { name: 'System health' });
    const queues = within(health).getByRole('table', {
      name: 'Background job queues and their job counts',
    });
    expect(within(queues).getByText('Has failures')).toBeTruthy();
    expect(within(queues).getByText('No answer')).toBeTruthy();
    expect(within(health).getAllByText('Up')).toHaveLength(2);

    const activity = within(system).getByRole('region', { name: 'Recent activity' });
    expect(within(activity).getByText('EVENT_PUBLISHED')).toBeTruthy();
    expect(within(activity).getByText('System')).toBeTruthy();
    expect(
      within(activity).getByRole('link', { name: 'Open audit log' }).getAttribute('href'),
    ).toBe('/dashboard/admin/audit-logs');

    await waitFor(() => expect(requested()).toContain('/v1/dashboard/super-admin'));
    expect(requested()).not.toContain('/v1/dashboard/student');
    expect(screen.queryByRole('region', { name: 'For you' })).toBeNull();
  });

  it('renders no email from any view', async () => {
    serve(superAdminProfile({ email: 'admin@example.com' }), { 'super-admin': superView });
    renderOverview();
    const system = await screen.findByRole('region', { name: 'System overview' });
    await within(system).findByRole('region', { name: 'Recent activity' });
    expect(system.textContent).not.toMatch(/@/);
  });
});
