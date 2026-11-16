import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AdminMembershipRow, UserProfile } from '@uniconnect/shared';
import {
  AdminMembershipsView,
  paramsFromUrl,
} from '@/app/(app)/dashboard/admin/memberships/_components/admin-memberships-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, studentProfile, superAdminProfile } from './utils';

let search = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/admin/memberships',
  useSearchParams: () => search,
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');
const patch = jest.spyOn(api, 'patch');

const CSE = { id: 1, name: 'CSE' };
const deptAdmin = () => facultyProfile({ role: 'dept_admin', department: CSE }) as UserProfile;

function row(overrides: Partial<AdminMembershipRow> = {}): AdminMembershipRow {
  return {
    id: 7,
    type: 'monthly',
    status: 'active',
    start_date: '2026-11-11',
    end_date: '2026-12-10',
    created_at: '2026-11-11T08:00:00.000Z',
    club: { id: 3, name: 'CSE Club', logo_url: null, department: CSE },
    payment: {
      transaction_id: 'UC-1',
      amount: '500.00',
      currency: 'BDT',
      status: 'completed',
      validated_at: null,
    },
    user: { id: 'u9', name: 'Nadia Islam', email: 'nadia@example.com', student_id: 'CSE-22/009' },
    ...overrides,
  };
}

function serve(me: UserProfile, rows: AdminMembershipRow[] = [row()]) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/admin/memberships') {
      return {
        data: {
          success: true,
          data: rows,
          meta: { page: 1, limit: 20, total: rows.length, total_pages: 1 },
        },
      };
    }
    if (url === '/v1/clubs') {
      return {
        data: {
          success: true,
          data: [
            { id: 3, name: 'CSE Club' },
            { id: 4, name: 'ECE Club' },
          ],
          meta: { page: 1, limit: 100, total: 2, total_pages: 1 },
        },
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

const renderPage = () =>
  renderWithQuery(
    <Workspace>
      <AdminMembershipsView />
    </Workspace>,
  );

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset();
  patch.mockReset();
  replace.mockReset();
  search = new URLSearchParams();
});

describe('paramsFromUrl', () => {
  it('keeps only values the API accepts', () => {
    expect(
      paramsFromUrl(new URLSearchParams('status=scheduled&type=yearly&club_id=4&page=2')),
    ).toEqual({ status: 'scheduled', type: 'yearly', club_id: 4, page: 2 });
    expect(paramsFromUrl(new URLSearchParams('status=paid&type=weekly&club_id=x&page=1'))).toEqual(
      {},
    );
  });
});

describe('admin memberships', () => {
  it('lists the department’s memberships for a dept_admin, without a club filter', async () => {
    serve(deptAdmin());
    renderPage();
    const table = await screen.findByRole('table', { name: 'Memberships, newest first' });
    const [, first] = within(table).getAllByRole('row');
    expect(within(first!).getByText('Nadia Islam')).toBeTruthy();
    expect(within(first!).getByText('CSE-22/009')).toBeTruthy();
    expect(within(first!).getByText('Active')).toBeTruthy();
    expect(within(first!).getByText('৳500.00')).toBeTruthy();
    expect(screen.queryByLabelText('Club')).toBeNull();
    expect(within(table).queryByText('Club')).toBeNull();
    expect(get).toHaveBeenCalledWith('/v1/admin/memberships', { params: {} });
  });

  it('gives a super admin the club filter and column', async () => {
    serve(superAdminProfile());
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByLabelText('Club')).toBeTruthy();
    expect(await screen.findByRole('option', { name: 'ECE Club' })).toBeTruthy();
  });

  it('writes filters to the URL and returns to page 1', async () => {
    search = new URLSearchParams('page=3');
    serve(deptAdmin());
    renderPage();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });
    expect(replace).toHaveBeenCalledWith('/dashboard/admin/memberships?status=pending', {
      scroll: false,
    });
  });

  it('sends the URL filters to the API', async () => {
    search = new URLSearchParams('status=cancelled&type=monthly');
    serve(deptAdmin());
    renderPage();
    await screen.findByRole('table');
    expect(get).toHaveBeenCalledWith('/v1/admin/memberships', {
      params: { status: 'cancelled', type: 'monthly' },
    });
  });

  it('cancels a membership after confirming', async () => {
    serve(deptAdmin());
    patch.mockResolvedValue(ok({ ...row(), status: 'cancelled' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Cancel Nadia Islam's membership/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText("Cancel Nadia Islam's CSE Club membership?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel membership' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/v1/memberships/7/cancel'));
  });

  it('offers no cancel on an expired or cancelled row', async () => {
    serve(deptAdmin(), [row({ status: 'expired' }), row({ id: 8, status: 'cancelled' })]);
    renderPage();
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
  });

  it('offers Clear filters when filters leave nothing', async () => {
    search = new URLSearchParams('status=scheduled');
    serve(deptAdmin(), []);
    renderPage();
    expect(await screen.findByText('No memberships match these filters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(replace).toHaveBeenCalledWith('/dashboard/admin/memberships');
  });

  it.each([
    ['a student', studentProfile()],
    ['faculty', facultyProfile()],
  ])('refuses %s without calling the API', async (_label, me) => {
    serve(me);
    renderPage();
    expect(await screen.findByText("You don't have access to this page.")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith('/v1/admin/memberships', expect.anything());
  });
});
