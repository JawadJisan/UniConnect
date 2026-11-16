import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdminUserDetail, AdminUserSummary } from '@uniconnect/shared';
import { UserDetailView } from '@/app/(app)/dashboard/admin/users/_components/user-detail-view';
import { paramsFromUrl, UsersView } from '@/app/(app)/dashboard/admin/users/_components/users-view';
import { SessionsCard } from '@/app/(app)/dashboard/profile/_components/sessions-card';
import { Workspace } from '@/app/(app)/_components/workspace';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { authClient, resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, fill, pending, renderWithQuery } from '../auth/utils';
import { ok, studentProfile, superAdminProfile } from './utils';

const replace = jest.fn();
let search = new URLSearchParams();
let params: Record<string, string> = {};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/admin/users',
  useSearchParams: () => search,
  useParams: () => params,
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');
const patch = jest.spyOn(api, 'patch');
const post = jest.spyOn(api, 'post');

const USER_ID = '7f1c3a52-0c3e-4f7b-9a43-3d0e2b8f4e11';

function summary(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  return {
    id: USER_ID,
    name: 'Ayesha Rahman',
    email: 'ayesha@example.com',
    avatar_url: null,
    user_type: 'student',
    role: 'student',
    department: { id: 1, name: 'CSE' },
    is_active: true,
    email_verified: true,
    created_at: '2026-11-08T10:00:00.000Z',
    ...overrides,
  };
}

function detail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    ...studentProfile({ id: USER_ID }),
    active_sessions: 2,
    last_login_at: '2026-11-09T10:00:00.000Z',
    role_sources: { committee: [], dept_admin: null },
    ...overrides,
  };
}

const meta = (total: number, page = 1) => ({
  page,
  limit: 20,
  total,
  total_pages: Math.max(1, Math.ceil(total / 20)),
});

/** Routes api.get by URL: the guard's /users/me, departments, and the admin endpoints. */
function serve({
  me = superAdminProfile(),
  list = { data: [summary()], meta: meta(1) } as unknown,
  user = detail() as unknown,
  sessions = { other_sessions: 0 },
}: {
  me?: ReturnType<typeof superAdminProfile>;
  list?: unknown;
  user?: unknown;
  sessions?: unknown;
} = {}) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/users/me/sessions') return ok(sessions);
    if (url === '/v1/departments')
      return ok([
        { id: 1, name: 'CSE', description: null },
        { id: 2, name: 'ECE', description: null },
      ]);
    if (url === '/v1/admin/users') {
      if (list instanceof Error) throw list;
      return { data: { success: true, ...(list as object) } };
    }
    if (url.startsWith('/v1/admin/users/')) {
      if (user instanceof Error) throw user;
      return ok(user);
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

function renderPage(ui: React.ReactElement) {
  return renderWithQuery(<Workspace>{ui}</Workspace>);
}

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  for (const m of [get, patch, post, replace]) m.mockReset();
  jest.mocked(toast.success).mockReset();
  jest.mocked(toast.error).mockReset();
  search = new URLSearchParams();
  params = { id: USER_ID };
});

describe('paramsFromUrl', () => {
  it('keeps only values the API accepts', () => {
    expect(
      paramsFromUrl(
        new URLSearchParams('search=ay&role=student&page=2&sort=name&order=asc&evil=1&page2=x'),
      ),
    ).toEqual({ search: 'ay', role: 'student', page: 2, sort: 'name', order: 'asc' });
    expect(paramsFromUrl(new URLSearchParams('page=1&sort=password&order=up'))).toEqual({});
  });
});

describe('users list', () => {
  it('tells a non-admin they have no access and never calls the admin API', async () => {
    serve({ me: studentProfile() });
    renderPage(<UsersView />);
    expect(await screen.findByText("You don't have access to this page.")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith('/v1/admin/users', expect.anything());
  });

  it('shows a loading state, then the rows with status as text', async () => {
    serve({
      list: {
        data: [summary(), summary({ id: 'u2', name: 'Rafi', is_active: false, role: 'moderator' })],
        meta: meta(2),
      },
    });
    renderPage(<UsersView />);

    expect(await screen.findByRole('link', { name: /Ayesha Rahman/ })).toBeTruthy();
    const rafi = screen.getByRole('link', { name: /Rafi/ }).closest('tr')!;
    expect(within(rafi).getByText('Suspended')).toBeTruthy();
    expect(within(rafi).getByText('Moderator')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ayesha Rahman/ }).getAttribute('href')).toBe(
      `/dashboard/admin/users/${USER_ID}`,
    );
    expect(screen.getByText('1–2 of 2')).toBeTruthy();
  });

  it('sends the URL filters to the API', async () => {
    search = new URLSearchParams('role=moderator&is_active=false&page=2');
    serve({ list: { data: [summary()], meta: meta(25, 2) } });
    renderPage(<UsersView />);

    await screen.findByRole('link', { name: /Ayesha Rahman/ });
    expect(get).toHaveBeenCalledWith('/v1/admin/users', {
      params: { role: 'moderator', is_active: 'false', page: 2 },
    });
    expect(screen.getByText('21–25 of 25')).toBeTruthy();
  });

  it('writes a filter change to the URL and resets the page', async () => {
    search = new URLSearchParams('page=3');
    serve();
    renderPage(<UsersView />);
    await screen.findByRole('link', { name: /Ayesha Rahman/ });

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'false' } });

    expect(replace).toHaveBeenCalledWith('/dashboard/admin/users?is_active=false', {
      scroll: false,
    });
  });

  it('debounces the search box into the URL', async () => {
    serve();
    renderPage(<UsersView />);
    await screen.findByRole('link', { name: /Ayesha Rahman/ });

    fill('Search by name or email', ' rafi ');
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/dashboard/admin/users?search=rafi', {
        scroll: false,
      }),
    );
  });

  it('sorts by name and pages forward', async () => {
    serve({ list: { data: [summary()], meta: meta(45) } });
    renderPage(<UsersView />);
    await screen.findByRole('link', { name: /Ayesha Rahman/ });

    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(replace).toHaveBeenLastCalledWith(
      '/dashboard/admin/users?sort=name&order=asc',
      expect.anything(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(replace).toHaveBeenLastCalledWith('/dashboard/admin/users?page=2', expect.anything());
    expect(screen.getByRole('button', { name: /Previous/ }).hasAttribute('disabled')).toBe(true);
  });

  it('offers to clear filters when nothing matches', async () => {
    search = new URLSearchParams('search=zzz');
    serve({ list: { data: [], meta: meta(0) } });
    renderPage(<UsersView />);

    expect(await screen.findByText('No users match these filters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(replace).toHaveBeenCalledWith('/dashboard/admin/users');
  });

  it('shows an error with a retry', async () => {
    serve({ list: axiosError(500, { success: false, error: { code: 'X', message: 'x' } }) });
    renderPage(<UsersView />);
    // A 5xx is retried once (about a second) before the error shows.
    expect(await screen.findByText("Couldn't load users.", {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('user detail', () => {
  it('shows account facts and why the role is what it is', async () => {
    serve({
      user: detail({
        role: 'moderator',
        role_sources: {
          committee: [
            {
              club_id: 1,
              club_name: 'CSE Club',
              position: 'President',
              term_start_year: 2026,
              term_end_year: 2027,
            },
          ],
          dept_admin: null,
        },
      }),
    });
    renderPage(<UserDetailView />);

    expect(await screen.findByRole('heading', { name: 'Ayesha Rahman' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Role: Moderator' })).toBeTruthy();
    expect(screen.getByText('President, CSE Club')).toBeTruthy();
    expect(screen.getByText('2 devices')).toBeTruthy();
  });

  it('says when a user does not exist', async () => {
    serve({
      user: axiosError(404, { success: false, error: { code: 'NOT_FOUND', message: 'x' } }),
    });
    renderPage(<UserDetailView />);
    expect(await screen.findByText("This user doesn't exist.")).toBeTruthy();
    expect(screen.getByRole('link', { name: /All users/ })).toBeTruthy();
  });

  it('recomputes the role and reports the change', async () => {
    serve({ user: detail({ role: 'moderator' }) });
    post.mockResolvedValue(ok({ role: 'student', previous_role: 'moderator', changed: true }));
    renderPage(<UserDetailView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Recompute role' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/v1/admin/users/${USER_ID}/recompute-role`),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Role changed from Moderator to Student.'),
    );
  });

  it('suspends after confirming, with the reason', async () => {
    serve();
    patch.mockResolvedValue(ok(detail({ is_active: false, active_sessions: 0 })));
    renderPage(<UserDetailView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Suspend account' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Suspend Ayesha Rahman?')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'Spam' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(`/v1/admin/users/${USER_ID}/status`, {
        is_active: false,
        reason: 'Spam',
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Ayesha Rahman is suspended.', {
        description: 'They were signed out on every device.',
      }),
    );
  });

  it('cannot suspend your own account', async () => {
    serve({ user: { ...detail(), ...superAdminProfile(), id: 'u1' } });
    params = { id: 'u1' };
    renderPage(<UserDetailView />);

    const button = await screen.findByRole('button', { name: 'Suspend account' });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/This is your own account/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Details' })).toBeNull();
  });

  it('sends only changed details and maps a 409 onto the field', async () => {
    serve();
    patch.mockRejectedValue(
      axiosError(409, {
        success: false,
        error: { code: 'STUDENT_ID_TAKEN', message: 'Student ID already registered.' },
      }),
    );
    renderPage(<UserDetailView />);

    await screen.findByRole('heading', { name: 'Details' });
    fill('Student ID', 'CSE-2022/099');
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(`/v1/admin/users/${USER_ID}`, {
        student_id: 'CSE-2022/099',
      }),
    );
    expect(await screen.findByText('Student ID already registered.')).toBeTruthy();
  });

  it('shows a blocked department move as a form alert', async () => {
    serve();
    patch.mockRejectedValue(
      axiosError(409, {
        success: false,
        error: { code: 'DEPARTMENT_CHANGE_BLOCKED', message: 'End their terms first.' },
      }),
    );
    renderPage(<UserDetailView />);

    await screen.findByRole('heading', { name: 'Details' });
    await screen.findByRole('option', { name: 'ECE' });
    fireEvent.change(screen.getByLabelText(/^Department/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(await screen.findByText('End their terms first.')).toBeTruthy();
    expect(patch).toHaveBeenCalledWith(`/v1/admin/users/${USER_ID}`, { department_id: 2 });
  });
});

describe('sessions card', () => {
  it('shows the count and signs the other devices out', async () => {
    serve({ sessions: { other_sessions: 2 } });
    renderWithQuery(<SessionsCard />);

    expect(await screen.findByText('Signed in on this device and 2 other devices.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out other devices' }));

    await waitFor(() => expect(authClient.revokeOtherSessions).toHaveBeenCalled());
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Signed out of your other devices.', {
        description: 'This device stays signed in.',
      }),
    );
  });

  it('disables the button when only this device is signed in', async () => {
    serve({ sessions: { other_sessions: 0 } });
    renderWithQuery(<SessionsCard />);
    expect(await screen.findByText('Only this device is signed in.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Sign out other devices' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('shows a loading state while counting', () => {
    get.mockImplementation(pending);
    renderWithQuery(<SessionsCard />);
    expect(
      screen.getByRole('button', { name: 'Sign out other devices' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
