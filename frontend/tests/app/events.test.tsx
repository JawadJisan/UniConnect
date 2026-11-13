import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { EventDetail, EventSummary, UserProfile } from '@uniconnect/shared';
import { EventDetailView } from '@/app/(app)/dashboard/events/_components/event-detail-view';
import { EventsView, paramsFromUrl } from '@/app/(app)/dashboard/events/_components/events-view';
import { MyRegistrationsView } from '@/app/(app)/dashboard/events/_components/my-registrations-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, studentProfile, superAdminProfile } from './utils';

let params: Record<string, string> = {};
let search = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/events',
  useSearchParams: () => search,
  useParams: () => params,
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');
const post = jest.spyOn(api, 'post');
const del = jest.spyOn(api, 'delete');
const patch = jest.spyOn(api, 'patch');

const CSE = { id: 1, name: 'CSE' };
const EEE = { id: 2, name: 'EEE' };
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

function summary(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 7,
    title: 'Hack Night',
    description: 'Build something.',
    organizer_club: { id: 3, name: 'CSE Club' },
    visibility: 'public',
    is_paid: false,
    fee_amount: null,
    start_date: future(5),
    end_date: future(5.1),
    venue: 'Hall 2',
    max_attendees: 40,
    registered_count: 12,
    poster_image_url: null,
    status: 'published',
    departments: [CSE],
    created_at: '2026-11-10T10:00:00.000Z',
    updated_at: '2026-11-10T10:00:00.000Z',
    ...overrides,
  };
}

function detail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    ...summary(),
    my_registration: null,
    can_manage: false,
    can_register: true,
    register_blocked_reason: null,
    ...overrides,
  };
}

const page = <T,>(data: T[]) => ({
  data: {
    success: true,
    data,
    meta: { page: 1, limit: 10, total: data.length, total_pages: 1 },
  },
});
const apiError = (status: number, code: string, message = 'x') =>
  axiosError(status, { success: false, error: { code, message } });

function serve({
  me = studentProfile(),
  events = [summary()] as unknown,
  event = detail() as unknown,
  mine = [] as unknown,
}: { me?: UserProfile; events?: unknown; event?: unknown; mine?: unknown } = {}) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/departments') return ok([CSE, EEE]);
    if (url === '/v1/clubs') return page([]);
    if (url === '/v1/events') {
      if (events instanceof Error) throw events;
      return page(events as EventSummary[]);
    }
    if (url === '/v1/events/my-registrations') return page(mine as unknown[]);
    if (url.startsWith('/v1/events/')) {
      if (event instanceof Error) throw event;
      return ok(event);
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

const renderPage = (ui: React.ReactElement) => renderWithQuery(<Workspace>{ui}</Workspace>);

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  for (const spy of [get, post, del, patch]) spy.mockReset();
  jest.mocked(toast.success).mockReset();
  replace.mockReset();
  params = { id: '7' };
  search = new URLSearchParams();
});

describe('event list params', () => {
  it('defaults to upcoming, lifts the filter for status=all, and drops unknown keys', () => {
    expect(paramsFromUrl(new URLSearchParams())).toEqual({ status: 'upcoming' });
    expect(paramsFromUrl(new URLSearchParams('status=all'))).toEqual({});
    expect(
      paramsFromUrl(new URLSearchParams('status=past&search=hack&page=2&evil=1&department_id=3')),
    ).toEqual({ status: 'past', search: 'hack', page: 2, department_id: '3' });
  });
});

describe('browse events', () => {
  it('shows each event as a card with seats, fee, venue and departments', async () => {
    serve({
      events: [
        summary(),
        summary({
          id: 8,
          title: 'Robotics Expo',
          is_paid: true,
          fee_amount: '200.00',
          visibility: 'members_only',
          max_attendees: 5,
          registered_count: 5,
          departments: [CSE, EEE],
        }),
      ],
    });
    renderPage(<EventsView />);

    const hack = await screen.findByRole('link', { name: /Hack Night/ });
    expect(hack.getAttribute('href')).toBe('/dashboard/events/7');
    expect(within(hack).getByText('12 / 40')).toBeTruthy();
    expect(within(hack).getByText('Free')).toBeTruthy();
    expect(within(hack).getByText('Hall 2')).toBeTruthy();

    const expo = screen.getByRole('link', { name: /Robotics Expo/ });
    expect(within(expo).getByText('৳200.00')).toBeTruthy();
    expect(within(expo).getByText('paid at the venue')).toBeTruthy();
    expect(within(expo).getByText('Full')).toBeTruthy();
    expect(within(expo).getByText('Members only')).toBeTruthy();
    expect(within(expo).getByText('EEE')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/v1/events', { params: { status: 'upcoming' } });
  });

  it('offers New event only to organizers', async () => {
    serve();
    renderPage(<EventsView />);
    await screen.findByRole('link', { name: /Hack Night/ });
    expect(screen.queryByRole('link', { name: 'New event' })).toBeNull();
  });

  it('shows New event and the draft filter to a dept_admin', async () => {
    serve({ me: facultyProfile({ role: 'dept_admin' }) });
    renderPage(<EventsView />);
    await screen.findByRole('link', { name: /Hack Night/ });
    expect(
      screen
        .getAllByRole('link', { name: 'New event' })
        .some((l) => l.getAttribute('href') === '/dashboard/events/new'),
    ).toBe(true);
    expect(screen.getByRole('option', { name: 'Drafts' })).toBeTruthy();
  });

  it('writes a filter to the URL and returns to page 1', async () => {
    search = new URLSearchParams('page=3');
    serve();
    renderPage(<EventsView />);
    await screen.findByRole('link', { name: /Hack Night/ });
    fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'members_only' } });
    expect(replace).toHaveBeenCalledWith('/dashboard/events?visibility=members_only', {
      scroll: false,
    });
  });

  it('says when filters hide everything and offers to clear them', async () => {
    search = new URLSearchParams('status=past');
    serve({ events: [] });
    renderPage(<EventsView />);
    expect(await screen.findByText('No events match these filters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(replace).toHaveBeenCalledWith('/dashboard/events');
  });

  it('shows a loading state, then an error with retry', async () => {
    serve({ events: apiError(500, 'INTERNAL') });
    renderPage(<EventsView />);
    expect(await screen.findByText('Loading events…')).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 }),
    ).toBeTruthy();
  });
});

describe('event page: registration', () => {
  it('registers and confirms with a toast', async () => {
    serve();
    post.mockResolvedValue(ok({ id: 1, status: 'registered' }));
    renderPage(<EventDetailView />);

    expect(await screen.findByRole('heading', { name: 'Hack Night' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/v1/events/7/register');
  });

  it('says the event is full when the last seat went first', async () => {
    serve();
    post.mockRejectedValue(apiError(409, 'EVENT_FULL', 'This event is full.'));
    renderPage(<EventDetailView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Register' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('This event is full.')).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('retries a busy (503) answer on its own, then succeeds', async () => {
    serve();
    post
      .mockRejectedValueOnce(apiError(503, 'EVENT_BUSY'))
      .mockResolvedValueOnce(ok({ id: 1, status: 'registered' }));
    renderPage(<EventDetailView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Register' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled(), { timeout: 4000 });
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('shows why registration is blocked for a members-only event', async () => {
    serve({
      event: detail({
        visibility: 'members_only',
        can_register: false,
        register_blocked_reason: 'not_eligible',
      }),
    });
    renderPage(<EventDetailView />);
    expect(await screen.findByText(/You need an active club membership/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull();
  });

  it('lets a registered attendee cancel through a confirm dialog', async () => {
    serve({
      event: detail({
        my_registration: { id: 1, status: 'registered' },
        can_register: false,
        register_blocked_reason: 'already_registered',
      }),
    });
    del.mockResolvedValue(ok({ id: 1, status: 'cancelled' }));
    renderPage(<EventDetailView />);
    expect(await screen.findByText('Registered')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel registration' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel registration' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/v1/events/7/register'));
  });

  it('disables cancelling once the event has started', async () => {
    serve({
      event: detail({
        start_date: future(-0.1),
        my_registration: { id: 1, status: 'registered' },
        can_register: false,
        register_blocked_reason: 'already_registered',
      }),
    });
    renderPage(<EventDetailView />);
    const cancel = await screen.findByRole('button', { name: 'Cancel registration' });
    expect(cancel).toHaveProperty('disabled', true);
    expect(screen.getByText(/can no longer be cancelled/)).toBeTruthy();
  });

  it('reads as missing for a 404 (not visible to this user)', async () => {
    serve({ event: apiError(404, 'EVENT_NOT_FOUND') });
    renderPage(<EventDetailView />);
    expect(await screen.findByText(/doesn't exist, or it isn't open to you/)).toBeTruthy();
  });
});

describe('event page: organizers', () => {
  it('hides the manage panel from people who do not manage the event', async () => {
    serve();
    renderPage(<EventDetailView />);
    await screen.findByRole('heading', { name: 'Hack Night' });
    expect(screen.queryByRole('heading', { name: 'Manage' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Poster' })).toBeNull();
  });

  it('publishes a draft through a confirm dialog', async () => {
    serve({
      me: facultyProfile({ role: 'dept_admin' }),
      event: detail({
        status: 'draft',
        can_manage: true,
        can_register: false,
        register_blocked_reason: 'not_open',
      }),
    });
    patch.mockResolvedValue(ok(detail({ can_manage: true })));
    renderPage(<EventDetailView />);
    expect(await screen.findByRole('heading', { name: 'Poster' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/can no longer change/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish event' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/v1/events/7/publish'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Event published.'));
  });

  it('keeps Mark completed disabled until the event ends, and shows the API refusal', async () => {
    serve({ me: superAdminProfile(), event: detail({ can_manage: true }) });
    patch.mockRejectedValue(apiError(409, 'EVENT_NOT_CANCELLABLE', 'Already cancelled.'));
    renderPage(<EventDetailView />);
    expect(await screen.findByRole('button', { name: 'Mark completed' })).toHaveProperty(
      'disabled',
      true,
    );
    // A super admin never sees the registration panel.
    expect(screen.queryByRole('heading', { name: 'Registration' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel event' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel event' }));
    expect(await within(dialog).findByText('Already cancelled.')).toBeTruthy();
  });
});

describe('my registrations', () => {
  it('lists registrations with uppercase status badges and switches to past', async () => {
    serve({
      mine: [
        {
          id: 1,
          status: 'attended',
          registered_at: '2026-11-01T10:00:00.000Z',
          checked_in_at: '2026-11-05T10:00:00.000Z',
          cancelled_at: null,
          event: summary(),
        },
      ],
    });
    renderPage(<MyRegistrationsView />);
    expect(await screen.findByRole('link', { name: 'Hack Night' })).toBeTruthy();
    expect(screen.getByText('Attended')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Past' }));
    expect(replace).toHaveBeenCalledWith('/dashboard/events?when=past', { scroll: false });
  });

  it('turns a super admin away', async () => {
    serve({ me: superAdminProfile() });
    renderPage(<MyRegistrationsView />);
    expect(await screen.findByText(/don't register for events/)).toBeTruthy();
  });

  it('points to browse when empty', async () => {
    serve();
    renderPage(<MyRegistrationsView />);
    const empty = (await screen.findByText('No upcoming registrations')).parentElement!;
    expect(within(empty).getByRole('link', { name: 'Browse events' })).toBeTruthy();
  });
});
