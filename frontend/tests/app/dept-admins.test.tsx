import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdminUserSummary, DeptAdminTerm, UserProfile } from '@uniconnect/shared';
import {
  DeptAdminsView,
  paramsFromUrl,
} from '@/app/(app)/dashboard/admin/dept-admins/_components/dept-admins-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { oneYearTermEnd, todayInDhaka } from '@/lib/terms';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, superAdminProfile } from './utils';

// /dashboard/admin/dept-admins (PRD FR-ADMIN-001–004, DECISIONS D34, D35).

let search = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/admin/dept-admins',
  useSearchParams: () => search,
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');
const post = jest.spyOn(api, 'post');
const patch = jest.spyOn(api, 'patch');

const CSE = { id: 1, name: 'CSE' };
const ECE = { id: 2, name: 'ECE' };
const TODAY = todayInDhaka();
const KARIM = '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c';

function term(overrides: Partial<DeptAdminTerm> = {}): DeptAdminTerm {
  return {
    id: 5,
    start_date: '2026-11-01',
    end_date: '2027-10-31',
    is_current: true,
    user: { id: KARIM, name: 'Dr. Karim Hossain', email: 'karim@example.com', avatar_url: null },
    department: CSE,
    created_at: '2026-11-01T08:00:00.000Z',
    updated_at: '2026-11-01T08:00:00.000Z',
    ...overrides,
  };
}

const faculty = (overrides: Partial<AdminUserSummary> = {}): AdminUserSummary => ({
  id: KARIM,
  name: 'Dr. Karim Hossain',
  email: 'karim@example.com',
  avatar_url: null,
  user_type: 'faculty',
  role: 'faculty',
  department: CSE,
  is_active: true,
  email_verified: true,
  created_at: '2026-11-01T08:00:00.000Z',
  ...overrides,
});

const page = <T,>(rows: T[]) => ({
  data: {
    success: true,
    data: rows,
    meta: { page: 1, limit: 20, total: rows.length, total_pages: 1 },
  },
});

function serve(me: UserProfile, rows: DeptAdminTerm[] = [term()]) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/departments') return ok([CSE, ECE]);
    if (url === '/v1/admin/dept-admin-terms') return page(rows);
    if (url === '/v1/admin/users') return page([faculty()]);
    throw new Error(`unexpected GET ${url}`);
  });
}

const renderPage = () =>
  renderWithQuery(
    <Workspace>
      <DeptAdminsView />
    </Workspace>,
  );

const apiError = (status: number, code: string, message = 'x', details?: unknown) =>
  axiosError(status, { success: false, error: { code, message, details } });

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  replace.mockReset();
  jest.mocked(toast.success).mockReset();
  search = new URLSearchParams();
});

describe('paramsFromUrl', () => {
  it('keeps only values the API accepts', () => {
    expect(paramsFromUrl(new URLSearchParams('department_id=2&is_current=false&page=3'))).toEqual({
      department_id: 2,
      is_current: 'false',
      page: 3,
    });
    expect(paramsFromUrl(new URLSearchParams('department_id=x&is_current=yes&page=1'))).toEqual({});
  });
});

describe('dept admins page', () => {
  it('is closed to anyone but a super admin', async () => {
    serve(facultyProfile({ role: 'dept_admin', department: CSE }) as UserProfile);
    renderPage();
    expect(await screen.findByText("You don't have access to this page.")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith('/v1/admin/dept-admin-terms', expect.anything());
  });

  it('lists terms with an uppercase status and actions on current rows only', async () => {
    serve(superAdminProfile(), [
      term(),
      term({
        id: 4,
        is_current: false,
        user: { id: 'u9', name: 'Dr. Old Admin', email: 'old@example.com', avatar_url: null },
      }),
    ]);
    renderPage();
    const current = (await screen.findByText('Dr. Karim Hossain')).closest('tr')!;
    expect(within(current).getByText('Current')).toBeTruthy();
    expect(
      within(current).getByRole('button', { name: /Renew Dr. Karim Hossain's term/ }),
    ).toBeTruthy();
    expect(
      within(current).getByRole('button', { name: /End early Dr. Karim Hossain's term/ }),
    ).toBeTruthy();
    const ended = screen.getByText('Dr. Old Admin').closest('tr')!;
    expect(within(ended).getByText('Ended')).toBeTruthy();
    expect(within(ended).queryByRole('button')).toBeNull();
  });

  it('puts filters in the URL and back on page 1', async () => {
    search = new URLSearchParams('page=2');
    serve(superAdminProfile());
    renderPage();
    await screen.findByText('Dr. Karim Hossain');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'false' } });
    expect(replace).toHaveBeenCalledWith('/dashboard/admin/dept-admins?is_current=false', {
      scroll: false,
    });
  });

  it('shows the empty state, filtered or not', async () => {
    serve(superAdminProfile(), []);
    renderPage();
    expect(await screen.findByText('No department admins yet')).toBeTruthy();
  });

  it('shows an error state when the list fails', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/v1/users/me') return ok(superAdminProfile());
      if (url === '/v1/departments') return ok([CSE]);
      throw apiError(403, 'FORBIDDEN');
    });
    renderPage();
    expect(
      await screen.findByText("You don't have access to department admin terms."),
    ).toBeTruthy();
  });
});

describe('assign dialog', () => {
  async function openAssign() {
    serve(superAdminProfile(), []);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Assign dept admin/ }));
    return screen.findByRole('dialog', { name: 'Assign a department admin' });
  }

  it('keeps the picker disabled until a department is chosen, with dates defaulted', async () => {
    const dialog = await openAssign();
    expect(within(dialog).getByText('Choose a department first.')).toBeTruthy();
    // Disabled through its <fieldset>, which :disabled reflects (the .disabled property doesn't).
    expect(within(dialog).getByLabelText('Faculty member: search').matches(':disabled')).toBe(true);
    expect((within(dialog).getByLabelText('Starts') as HTMLInputElement).value).toBe(TODAY);
    expect((within(dialog).getByLabelText('Last day') as HTMLInputElement).value).toBe(
      oneYearTermEnd(TODAY),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign dept admin' }));
    expect(await within(dialog).findByText('Choose a department.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('searches faculty of the chosen department and assigns', async () => {
    const dialog = await openAssign();
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'CSE' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: '1' } });
    fireEvent.change(within(dialog).getByLabelText('Faculty member: search'), {
      target: { value: 'karim' },
    });
    fireEvent.click(
      await within(dialog).findByRole('radio', { name: /Dr. Karim Hossain/ }, { timeout: 2000 }),
    );
    expect(get).toHaveBeenCalledWith('/v1/admin/users', {
      params: {
        user_type: 'faculty',
        is_active: 'true',
        department_id: 1,
        search: 'karim',
        limit: 10,
      },
    });

    post.mockResolvedValue(ok(term()));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign dept admin' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/admin/dept-admin-terms', {
        user_id: KARIM,
        department_id: 1,
        start_date: TODAY,
        end_date: oneYearTermEnd(TODAY),
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Dr. Karim Hossain is now the CSE department admin.',
      ),
    );
  });

  it('shows DEPARTMENT_HAS_ADMIN as a form-level error', async () => {
    const dialog = await openAssign();
    await waitFor(() => expect(within(dialog).getByRole('option', { name: 'CSE' })).toBeTruthy());
    fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: '1' } });
    fireEvent.change(within(dialog).getByLabelText('Faculty member: search'), {
      target: { value: 'karim' },
    });
    fireEvent.click(
      await within(dialog).findByRole('radio', { name: /Dr. Karim Hossain/ }, { timeout: 2000 }),
    );
    post.mockRejectedValue(
      apiError(
        409,
        'DEPARTMENT_HAS_ADMIN',
        'This department already has a current admin. End or renew that term first.',
      ),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign dept admin' }));
    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText('No one was assigned.')).toBeTruthy();
    expect(within(alert).getByText(/already has a current admin/)).toBeTruthy();
  });
});

describe('renew and end', () => {
  it('renews with new dates', async () => {
    serve(superAdminProfile());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Renew Dr. Karim Hossain's term/ }));
    const dialog = await screen.findByRole('dialog', { name: /Renew Dr. Karim Hossain's term/ });
    expect((within(dialog).getByLabelText('Last day') as HTMLInputElement).value).toBe(
      '2028-10-31',
    );
    post.mockResolvedValue(ok(term({ id: 6, end_date: '2028-10-31' })));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Renew term' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/admin/dept-admin-terms/5/renew', {
        start_date: TODAY,
        end_date: '2028-10-31',
      }),
    );
  });

  it('ends a term early after confirmation', async () => {
    serve(superAdminProfile());
    renderPage();
    fireEvent.click(
      await screen.findByRole('button', { name: /End early Dr. Karim Hossain's term/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: /End Dr. Karim Hossain's term early/,
    });
    expect(within(dialog).getByText(/go back to faculty, or moderator/)).toBeTruthy();
    patch.mockResolvedValue(ok(term({ is_current: false })));
    fireEvent.click(within(dialog).getByRole('button', { name: 'End term' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/v1/admin/dept-admin-terms/5/end'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Dr. Karim Hossain is no longer the CSE department admin.',
      ),
    );
  });
});
