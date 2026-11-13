import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ClubDetail, EventDetail, UserProfile } from '@uniconnect/shared';
import { EditEventView } from '@/app/(app)/dashboard/events/_components/edit-event-view';
import { NewEventView } from '@/app/(app)/dashboard/events/_components/new-event-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, fill, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, studentProfile, superAdminProfile } from './utils';

let params: Record<string, string> = {};
const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/dashboard/events/new',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => params,
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');
const post = jest.spyOn(api, 'post');
const patch = jest.spyOn(api, 'patch');

const CSE = { id: 1, name: 'CSE' };
const EEE = { id: 2, name: 'EEE' };

const myClub: ClubDetail = {
  id: 3,
  name: 'CSE Club',
  description: null,
  logo_url: null,
  membership_fee_monthly: null,
  membership_fee_yearly: null,
  department: CSE,
  updated_at: '2026-11-10T10:00:00.000Z',
  committee: [],
};

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: 7,
    title: 'Hack Night',
    description: null,
    organizer_club: { id: 3, name: 'CSE Club' },
    visibility: 'public',
    is_paid: false,
    fee_amount: null,
    start_date: '2030-01-10T08:00:00.000Z',
    end_date: '2030-01-10T11:00:00.000Z',
    venue: 'Hall 2',
    max_attendees: 40,
    registered_count: 0,
    poster_image_url: null,
    status: 'draft',
    departments: [CSE],
    created_at: '2026-11-10T10:00:00.000Z',
    updated_at: '2026-11-10T10:00:00.000Z',
    my_registration: null,
    can_manage: true,
    can_register: false,
    register_blocked_reason: 'not_open',
    ...overrides,
  };
}

const clubsPage = {
  data: {
    success: true,
    data: [{ ...myClub, committee: undefined }],
    meta: { page: 1, limit: 100, total: 1, total_pages: 1 },
  },
};

function serve(me: UserProfile, detail: EventDetail = event()) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/departments') return ok([CSE, EEE]);
    if (url === '/v1/clubs') return clubsPage;
    if (url === '/v1/clubs/my-club') return ok(myClub);
    if (url.startsWith('/v1/events/')) return ok(detail);
    throw new Error(`unexpected GET ${url}`);
  });
}

const deptAdmin = () => facultyProfile({ role: 'dept_admin' });
const renderPage = (ui: React.ReactElement) => renderWithQuery(<Workspace>{ui}</Workspace>);
const apiError = (status: number, code: string, message = 'x', details?: unknown) =>
  axiosError(status, { success: false, error: { code, message, details } });

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  for (const spy of [get, post, patch]) spy.mockReset();
  push.mockReset();
  params = { id: '7' };
});

async function fillValidDraft() {
  fill('Title', 'Hack Night');
  fill('Starts', '2030-01-10T14:00');
  fill('Ends', '2030-01-10T17:00');
}

describe('new event', () => {
  it('turns away people who cannot organize', async () => {
    serve(studentProfile());
    renderPage(<NewEventView />);
    expect(await screen.findByText(/club committee members, department admins/)).toBeTruthy();
  });

  it("fixes a dept_admin's club, includes its department, and sends Dhaka times", async () => {
    serve(deptAdmin());
    post.mockResolvedValue(ok(event()));
    renderPage(<NewEventView />);

    const club = (await screen.findByLabelText('Organizing club')) as HTMLInputElement;
    await waitFor(() => expect(club.value).toBe('CSE Club'));
    expect(club.readOnly).toBe(true);
    const departments = screen.getByRole('group', { name: 'Participating departments' });
    expect(within(departments).getByText('Always included')).toBeTruthy();

    await fillValidDraft();
    fireEvent.click(screen.getByLabelText('EEE'));
    fill(/^Capacity/, '40');
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/v1/events', {
      title: 'Hack Night',
      organizer_club_id: 3,
      visibility: 'public',
      is_paid: false,
      start_date: '2030-01-10T14:00:00+06:00',
      end_date: '2030-01-10T17:00:00+06:00',
      max_attendees: 40,
      department_ids: [2, 1],
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/events/7'));
  });

  it('checks the date order, the fee rule and the capacity before sending', async () => {
    serve(deptAdmin());
    renderPage(<NewEventView />);
    await screen.findByDisplayValue('CSE Club');
    fill('Title', 'Hack Night');
    fill('Starts', '2030-01-10T14:00');
    fill('Ends', '2030-01-10T13:00');
    fill(/^Capacity/, '0');
    fireEvent.click(screen.getByLabelText('This event has a fee'));
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));

    expect(await screen.findByText('The event must end after it starts.')).toBeTruthy();
    expect(screen.getByText('A paid event needs a fee.')).toBeTruthy();
    expect(screen.getByText(/Capacity must be a whole number/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses a start in the past', async () => {
    serve(deptAdmin());
    renderPage(<NewEventView />);
    await screen.findByDisplayValue('CSE Club');
    fill('Title', 'Old');
    fill('Starts', '2020-01-10T14:00');
    fill('Ends', '2020-01-10T17:00');
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('The start must be in the future.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('lets a super admin choose the club, and puts server errors on their field', async () => {
    serve(superAdminProfile());
    post.mockRejectedValue(
      apiError(400, 'UNKNOWN_DEPARTMENT', 'One of the departments does not exist.'),
    );
    renderPage(<NewEventView />);
    const club = await screen.findByLabelText('Organizing club');
    await screen.findByRole('option', { name: 'CSE Club' });
    fireEvent.change(club, { target: { value: '3' } });
    await fillValidDraft();
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('One of the departments does not exist.')).toBeTruthy();
  });
});

describe('edit event', () => {
  it('sends only the changed fields, and null for a cleared one', async () => {
    serve(deptAdmin());
    patch.mockResolvedValue(ok(event({ title: 'Hack Night 2', venue: null })));
    renderPage(<EditEventView />);
    expect(await screen.findByDisplayValue('Hack Night')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toHaveProperty('disabled', true);

    fill('Title', 'Hack Night 2');
    fill(/^Venue/, '');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/events/7', { title: 'Hack Night 2', venue: null }),
    );
  });

  it('locks dates, visibility and departments once published', async () => {
    serve(deptAdmin(), event({ status: 'published' }));
    renderPage(<EditEventView />);
    expect(await screen.findByDisplayValue('Hack Night')).toBeTruthy();
    expect(screen.getByText(/locked once an event is published/)).toBeTruthy();
    expect(screen.getByLabelText('Starts')).toHaveProperty('disabled', true);
    expect(screen.getByLabelText('Ends')).toHaveProperty('disabled', true);
    // Inside a disabled fieldset: the control matches :disabled.
    expect((await screen.findByLabelText('EEE')).matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Members only', { exact: false }).matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Title')).toHaveProperty('disabled', false);
  });

  it('puts a capacity below the seats taken on the capacity field', async () => {
    serve(deptAdmin(), event({ status: 'published', registered_count: 10 }));
    patch.mockRejectedValue(
      apiError(409, 'CAPACITY_BELOW_REGISTRATIONS', '10 people are already registered.'),
    );
    renderPage(<EditEventView />);
    await screen.findByDisplayValue('Hack Night');
    fill(/^Capacity/, '5');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('10 people are already registered.')).toBeTruthy();
  });

  it('refuses people who do not manage the event, and closed events', async () => {
    serve(studentProfile(), event({ can_manage: false }));
    const { unmount } = renderPage(<EditEventView />);
    expect(await screen.findByText(/Only this event's organizers can edit it/)).toBeTruthy();
    unmount();

    serve(deptAdmin(), event({ status: 'completed' }));
    renderPage(<EditEventView />);
    expect(await screen.findByText(/completed and can no longer be edited/)).toBeTruthy();
  });
});
