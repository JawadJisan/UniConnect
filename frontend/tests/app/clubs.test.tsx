import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ClubDetail, ClubSummary, UserProfile } from '@uniconnect/shared';
import { ClubDetailView } from '@/app/(app)/dashboard/clubs/_components/club-detail-view';
import { ClubsView } from '@/app/(app)/dashboard/clubs/_components/clubs-view';
import { MyClubView } from '@/app/(app)/dashboard/clubs/_components/my-club-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { canEditClub } from '@/lib/club-access';
import { formatBdt } from '@/lib/format';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, fill, pending, renderWithQuery } from '../auth/utils';
import { facultyProfile, fakeFile, ok, studentProfile, superAdminProfile } from './utils';

let params: Record<string, string> = {};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/dashboard/clubs',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => params,
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');
const patch = jest.spyOn(api, 'patch');

const CSE = { id: 1, name: 'CSE' };
const ECE = { id: 2, name: 'ECE' };

function club(overrides: Partial<ClubDetail> = {}): ClubDetail {
  return {
    id: 3,
    name: 'CSE Club',
    description: 'Computing, together.',
    logo_url: null,
    membership_fee_monthly: '100.00',
    membership_fee_yearly: null,
    department: CSE,
    updated_at: '2026-11-10T10:00:00.000Z',
    committee: [],
    ...overrides,
  };
}

function summary(overrides: Partial<ClubSummary> = {}): ClubSummary {
  const { committee, ...rest } = club(overrides as Partial<ClubDetail>);
  void committee;
  return rest;
}

const deptAdmin = (department = CSE) =>
  facultyProfile({ role: 'dept_admin', department }) as UserProfile;

/** Routes api.get by URL: the guard's /users/me and the clubs endpoints. */
function serve({
  me = studentProfile(),
  list = [summary(), summary({ id: 4, name: 'ECE Club', department: ECE })] as unknown,
  detail = club() as unknown,
  mine = club() as unknown,
}: { me?: UserProfile; list?: unknown; detail?: unknown; mine?: unknown } = {}) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/clubs') {
      if (list instanceof Error) throw list;
      const data = list as ClubSummary[];
      return {
        data: {
          success: true,
          data,
          meta: { page: 1, limit: 100, total: data.length, total_pages: 1 },
        },
      };
    }
    if (url === '/v1/clubs/my-club') {
      if (mine instanceof Error) throw mine;
      return ok(mine);
    }
    if (url.startsWith('/v1/clubs/')) {
      if (detail instanceof Error) throw detail;
      return ok(detail);
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

const renderPage = (ui: React.ReactElement) => renderWithQuery(<Workspace>{ui}</Workspace>);
const apiError = (status: number, code: string, message = 'x', details?: unknown) =>
  axiosError(status, { success: false, error: { code, message, details } });

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset();
  patch.mockReset();
  jest.mocked(toast.success).mockReset();
  params = { id: '3' };
});

describe('formatBdt', () => {
  it.each([
    ['0.00', '৳0.00'],
    ['100.00', '৳100.00'],
    ['1500.5', '৳1,500.50'],
    ['99999999.99', '৳99,999,999.99'],
    ['007', '৳7.00'],
  ])('%s → %s', (input, expected) => {
    expect(formatBdt(input)).toBe(expected);
  });
});

describe('canEditClub', () => {
  const target = { department: CSE };
  it.each([
    ['a student', studentProfile(), false],
    ['faculty', facultyProfile(), false],
    ['a moderator', studentProfile({ role: 'moderator' }), false],
    ['the dept_admin of the club', deptAdmin(CSE), true],
    ['a dept_admin of another department', deptAdmin(ECE), false],
    ['a super admin', superAdminProfile(), true],
  ])('%s → %s', (_label, profile, expected) => {
    expect(canEditClub(profile, target)).toBe(expected);
  });
});

describe('club directory', () => {
  it('shows a loading state, then every club with its department and fees', async () => {
    serve();
    renderPage(<ClubsView />);

    const cse = await screen.findByRole('link', { name: /CSE Club/ });
    expect(cse.getAttribute('href')).toBe('/dashboard/clubs/3');
    expect(within(cse).getByText('৳100.00')).toBeTruthy();
    expect(within(cse).getByText('Not set')).toBeTruthy();
    expect(within(cse).getByText('Your department')).toBeTruthy();
    const ece = screen.getByRole('link', { name: /ECE Club/ });
    expect(within(ece).queryByText('Your department')).toBeNull();
    expect(screen.getByText('2 clubs')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/v1/clubs', { params: { limit: 100 } });
  });

  it('marks the list busy while it loads', async () => {
    serve();
    get.mockImplementation(async (url: string) => {
      if (url === '/v1/users/me') return ok(studentProfile());
      return pending();
    });
    renderPage(<ClubsView />);
    expect(await screen.findByText('Loading clubs…')).toBeTruthy();
  });

  it('says so when there are no clubs', async () => {
    serve({ list: [] });
    renderPage(<ClubsView />);
    expect(await screen.findByText('No clubs yet')).toBeTruthy();
  });

  it('shows an error with a retry that refetches', async () => {
    serve({ list: apiError(500, 'INTERNAL') });
    renderPage(<ClubsView />);
    const retry = await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 });
    serve();
    fireEvent.click(retry);
    expect(await screen.findByRole('link', { name: /CSE Club/ })).toBeTruthy();
  });
});

describe('club page', () => {
  it('shows the club, its fees and the current committee', async () => {
    serve({
      detail: club({
        committee: [
          {
            id: 9,
            position: 'President',
            term_start_year: 2026,
            term_end_year: 2027,
            user: { id: 'u9', name: 'Rafi Ahmed', avatar_url: null },
          },
        ],
      }),
    });
    renderPage(<ClubDetailView />);

    expect(await screen.findByRole('heading', { level: 1, name: 'CSE Club' })).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/v1/clubs/3');
    const committee = screen.getByRole('region', { name: 'Committee' });
    const row = within(committee).getByText('Rafi Ahmed').closest('tr')!;
    expect(within(row).getByText('President')).toBeTruthy();
    expect(within(row).getByText('2026–2027')).toBeTruthy();
    const about = screen.getByRole('region', { name: 'About' });
    expect(within(about).getByText('৳100.00')).toBeTruthy();
  });

  it('says when the committee is empty', async () => {
    serve();
    renderPage(<ClubDetailView />);
    expect(await screen.findByText(/No committee members yet/)).toBeTruthy();
  });

  it.each([
    ['a student', studentProfile()],
    ['faculty', facultyProfile()],
    ['a moderator', studentProfile({ role: 'moderator' })],
    ['a dept_admin of another department', deptAdmin(ECE)],
  ])('shows no edit panels to %s', async (_label, me) => {
    serve({ me });
    renderPage(<ClubDetailView />);
    await screen.findByRole('heading', { level: 1, name: 'CSE Club' });
    expect(screen.queryByRole('region', { name: 'Details & fees' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Logo' })).toBeNull();
  });

  it.each([
    ['the dept_admin of the club', deptAdmin(CSE)],
    ['a super admin', superAdminProfile()],
  ])('shows the edit and logo panels to %s', async (_label, me) => {
    serve({ me });
    renderPage(<ClubDetailView />);
    expect(await screen.findByRole('region', { name: 'Details & fees' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Logo' })).toBeTruthy();
  });

  it("says a missing club doesn't exist, without a retry", async () => {
    serve({ detail: apiError(404, 'CLUB_NOT_FOUND') });
    renderPage(<ClubDetailView />);
    expect(await screen.findByText("This club doesn't exist.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('treats a malformed id as missing and never calls the API for it', async () => {
    params = { id: 'abc' };
    serve();
    renderPage(<ClubDetailView />);
    expect(await screen.findByText("This club doesn't exist.")).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith(expect.stringMatching(/^\/v1\/clubs\//));
  });
});

describe('club edit form', () => {
  async function openAsEditor(detail = club()) {
    serve({ me: deptAdmin(CSE), detail });
    renderPage(<ClubDetailView />);
    await screen.findByRole('region', { name: 'Details & fees' });
    return screen.getByRole('button', { name: 'Save club' });
  }

  it('keeps Save disabled and secondary until something changes', async () => {
    const save = await openAsEditor();
    expect(save.hasAttribute('disabled')).toBe(true);
    fill(/^Monthly fee/, '150');
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
  });

  it('sends only changed fields, with an emptied field as null, then confirms', async () => {
    const save = await openAsEditor();
    patch.mockResolvedValue(
      ok(
        club({
          membership_fee_monthly: '150.00',
          description: null,
          updated_at: '2026-11-10T11:00:00.000Z',
        }),
      ),
    );
    fill(/^Monthly fee/, '150');
    fill(/^Description/, '');
    fireEvent.click(save);

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith('/v1/clubs/3', {
      membership_fee_monthly: '150.00',
      description: null,
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Club details saved.'));
  });

  it.each([
    ['10.005', 'Fee must be a non-negative amount with at most 2 decimal places.'],
    ['-1', 'Fee must be a non-negative amount with at most 2 decimal places.'],
    ['free', 'Fee must be a non-negative amount with at most 2 decimal places.'],
  ])('refuses the fee %s inline and sends nothing', async (value, message) => {
    const save = await openAsEditor();
    fill(/^Yearly fee/, value);
    fireEvent.click(save);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByLabelText(/^Yearly fee/).getAttribute('aria-invalid')).toBe('true');
    expect(patch).not.toHaveBeenCalled();
  });

  it('puts a server validation issue on its field', async () => {
    const save = await openAsEditor();
    patch.mockRejectedValue(
      apiError(400, 'VALIDATION_ERROR', 'Request validation failed.', [
        { path: 'name', message: 'Name is taken by the server.' },
      ]),
    );
    fill('Club name', 'CSE Society');
    fireEvent.click(save);
    expect(await screen.findByText('Name is taken by the server.')).toBeTruthy();
  });

  it('explains a refusal from the server in a form alert', async () => {
    const save = await openAsEditor();
    patch.mockRejectedValue(apiError(403, 'FORBIDDEN'));
    fill('Club name', 'CSE Society');
    fireEvent.click(save);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("You can't edit this club.");
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('club logo upload', () => {
  const createObjectURL = jest.fn(() => 'blob:logo-1');
  beforeAll(() => Object.assign(URL, { createObjectURL, revokeObjectURL: jest.fn() }));

  function pick(file: File) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('refuses a bad file before any upload', async () => {
    serve({ me: superAdminProfile() });
    renderPage(<ClubDetailView />);
    await screen.findByRole('button', { name: 'Add a logo' });
    pick(fakeFile('a.gif', 'image/gif'));
    expect(screen.getByRole('alert').textContent).toBe('Choose a JPEG, PNG or WebP image.');
    pick(fakeFile('big.png', 'image/png', 6 * 1024 * 1024));
    expect(screen.getByRole('alert').textContent).toContain('Choose one up to 5 MB.');
    expect(patch).not.toHaveBeenCalled();
  });

  it('previews, uploads the file in the logo field and confirms', async () => {
    serve({ me: superAdminProfile() });
    patch.mockResolvedValue(ok(club({ logo_url: 'https://res.cloudinary.com/demo/c.png' })));
    renderPage(<ClubDetailView />);
    await screen.findByRole('button', { name: 'Add a logo' });

    const file = fakeFile('logo.png', 'image/png');
    pick(file);
    fireEvent.click(screen.getByRole('button', { name: 'Upload logo' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [path, body] = patch.mock.calls[0]!;
    expect(path).toBe('/v1/clubs/3/logo');
    expect((body as FormData).get('logo')).toBe(file);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Club logo updated.'));
  });
});

describe('my club', () => {
  it("shows the caller's department club", async () => {
    serve({ mine: club() });
    renderPage(<MyClubView />);
    expect(await screen.findByRole('heading', { level: 1, name: 'CSE Club' })).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/v1/clubs/my-club');
  });

  it('tells a super admin there is no club of their own, and links to all clubs', async () => {
    serve({ me: superAdminProfile(), mine: apiError(404, 'NO_DEPARTMENT_CLUB') });
    renderPage(<MyClubView />);
    expect(await screen.findByText(/Super admins don't belong to a department/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse all clubs' }).getAttribute('href')).toBe(
      '/dashboard/clubs',
    );
  });

  it("says when the department doesn't have a club yet", async () => {
    serve({ mine: apiError(404, 'CLUB_NOT_FOUND') });
    renderPage(<MyClubView />);
    expect(await screen.findByText("Your department doesn't have a club yet.")).toBeTruthy();
  });
});
