import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { EventDetail, EventRegistration, UserProfile } from '@uniconnect/shared';
import { EventRegistrationsView } from '@/app/(app)/dashboard/events/_components/event-registrations-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, studentProfile } from './utils';

let search = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/events/7/registrations',
  useSearchParams: () => search,
  useParams: () => ({ id: '7' }),
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');
const patch = jest.spyOn(api, 'patch');

const event: EventDetail = {
  id: 7,
  title: 'Hack Night',
  description: null,
  organizer_club: { id: 3, name: 'CSE Club' },
  visibility: 'public',
  is_paid: false,
  fee_amount: null,
  start_date: '2026-11-10T08:00:00.000Z',
  end_date: '2030-11-10T11:00:00.000Z',
  venue: 'Hall 2',
  max_attendees: 40,
  registered_count: 2,
  poster_image_url: null,
  status: 'published',
  departments: [{ id: 1, name: 'CSE' }],
  created_at: '2026-11-01T10:00:00.000Z',
  updated_at: '2026-11-01T10:00:00.000Z',
  my_registration: null,
  can_manage: true,
  can_register: false,
  register_blocked_reason: 'not_open',
};

function reg(overrides: Partial<EventRegistration> = {}): EventRegistration {
  return {
    id: 11,
    status: 'registered',
    registered_at: '2026-11-02T10:00:00.000Z',
    checked_in_at: null,
    cancelled_at: null,
    user: {
      id: 'u2',
      name: 'Nadia Islam',
      avatar_url: null,
      student_id: 'CSE-2023/001',
      department: { id: 1, name: 'CSE' },
    },
    ...overrides,
  };
}

function serve(me: UserProfile, detail: EventDetail = event, rows = [reg()]) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/events/7') return ok(detail);
    if (url === '/v1/events/7/registrations') {
      return {
        data: {
          success: true,
          data: rows,
          meta: { page: 1, limit: 10, total: rows.length, total_pages: 1 },
        },
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

const organizer = () => facultyProfile({ role: 'dept_admin' });
const renderPage = () =>
  renderWithQuery(
    <Workspace>
      <EventRegistrationsView />
    </Workspace>,
  );

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset();
  patch.mockReset();
  replace.mockReset();
  jest.mocked(toast.success).mockReset();
  jest.mocked(toast.error).mockReset();
  search = new URLSearchParams();
});

describe('registrations and check-in', () => {
  it('checks a person in and flips the row without waiting for a refetch', async () => {
    serve(organizer());
    patch.mockResolvedValue(
      ok(reg({ status: 'attended', checked_in_at: '2026-11-12T09:00:00.000Z' })),
    );
    renderPage();

    const button = await screen.findByRole('button', { name: 'Check in Nadia Islam' });
    expect(screen.getByText('CSE-2023/001')).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/events/7/registrations/11/check-in'),
    );
    const table = screen.getByRole('table');
    expect(await within(table).findByText('Attended')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check in Nadia Islam' })).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Nadia Islam checked in.');
  });

  it('shows the API refusal as a toast', async () => {
    serve(organizer());
    patch.mockRejectedValue(
      axiosError(409, {
        success: false,
        error: { code: 'ALREADY_CHECKED_IN', message: 'This person is already checked in.' },
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Check in Nadia Islam' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('This person is already checked in.'),
    );
  });

  it('offers a CSV link that keeps the status filter, and never shows email', async () => {
    search = new URLSearchParams('status=attended');
    serve(organizer());
    renderPage();
    const csv = await screen.findByRole('link', { name: 'Download CSV' });
    expect(csv.getAttribute('href')).toBe(
      '/api/v1/events/7/registrations?format=csv&status=attended',
    );
    expect(get).toHaveBeenCalledWith('/v1/events/7/registrations', {
      params: { status: 'attended', page: 1 },
    });
    expect(screen.queryByText(/@/)).toBeNull();
  });

  it('has no check-in once the event is closed', async () => {
    serve(organizer(), { ...event, status: 'completed' }, [reg()]);
    renderPage();
    expect(await screen.findByText('Nadia Islam')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Check in/ })).toBeNull();
    expect(screen.getByText(/open while the event is published/)).toBeTruthy();
  });

  it('filters by status through the URL', async () => {
    serve(organizer());
    renderPage();
    await screen.findByText('Nadia Islam');
    fireEvent.change(screen.getByLabelText('Registration status'), {
      target: { value: 'no_show' },
    });
    expect(replace).toHaveBeenCalledWith('/dashboard/events/7/registrations?status=no_show', {
      scroll: false,
    });
  });

  it('turns away people who do not manage the event', async () => {
    serve(studentProfile(), { ...event, can_manage: false });
    renderPage();
    expect(
      await screen.findByText(/Only this event's organizers can see who registered/),
    ).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith('/v1/events/7/registrations', expect.anything());
  });

  it('says when nobody has registered', async () => {
    serve(organizer(), event, []);
    renderPage();
    const empty = (await screen.findByText('No registrations yet')).parentElement!;
    expect(within(empty).getByText(/ready to check in/)).toBeTruthy();
  });
});
