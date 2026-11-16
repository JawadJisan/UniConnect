import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  ClubDetail,
  CommitteeCandidate,
  CommitteeEntry,
  UserProfile,
} from '@uniconnect/shared';
import { ClubDetailView } from '@/app/(app)/dashboard/clubs/_components/club-detail-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { currentDhakaYear } from '@/lib/terms';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, studentProfile, superAdminProfile } from './utils';

// The committee panel on /dashboard/clubs/[id] (PRD FR-COMM-001–004, DECISIONS D34, D35).

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/dashboard/clubs/3',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: '3' }),
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');
const post = jest.spyOn(api, 'post');
const patch = jest.spyOn(api, 'patch');

const CSE = { id: 1, name: 'CSE' };
const YEAR = currentDhakaYear();
const deptAdmin = () => facultyProfile({ role: 'dept_admin', department: CSE }) as UserProfile;

function club(overrides: Partial<ClubDetail> = {}): ClubDetail {
  return {
    id: 3,
    name: 'CSE Club',
    description: null,
    logo_url: null,
    membership_fee_monthly: null,
    membership_fee_yearly: null,
    department: CSE,
    updated_at: '2026-11-10T10:00:00.000Z',
    committee: [],
    ...overrides,
  };
}

function entry(overrides: Partial<CommitteeEntry> = {}): CommitteeEntry {
  return {
    id: 11,
    club_id: 3,
    position: 'President',
    term_start_year: YEAR,
    term_end_year: YEAR + 1,
    is_current: true,
    user: { id: 'u5', name: 'Rafi Ahmed', avatar_url: null },
    updated_at: '2026-11-12T08:00:00.000Z',
    ...overrides,
  };
}

const CANDIDATES: CommitteeCandidate[] = [
  {
    id: '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c',
    name: 'Nadia Islam',
    avatar_url: null,
    user_type: 'student',
    student_id: 'CSE-22/009',
    on_committee: false,
  },
  {
    id: '4f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c',
    name: 'Rafi Ahmed',
    avatar_url: null,
    user_type: 'student',
    student_id: 'CSE-22/010',
    on_committee: true,
  },
];

function serve(me: UserProfile, rows: CommitteeEntry[] = [entry()], detail = club()) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/clubs/3/committee') {
      return {
        data: {
          success: true,
          data: rows,
          meta: { page: 1, limit: 100, total: rows.length, total_pages: 1 },
        },
      };
    }
    if (url === '/v1/clubs/3/committee/candidates') return ok(CANDIDATES);
    if (url === '/v1/clubs/3') return ok(detail);
    throw new Error(`unexpected GET ${url}`);
  });
}

const renderPage = () =>
  renderWithQuery(
    <Workspace>
      <ClubDetailView />
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
  jest.mocked(toast.success).mockReset();
});

describe('committee panel, viewers', () => {
  it('shows current members from the club detail, with no actions and no committee request', async () => {
    serve(
      studentProfile(),
      [],
      club({
        committee: [
          {
            id: 1,
            position: 'President',
            term_start_year: YEAR,
            term_end_year: YEAR + 1,
            user: { id: 'u5', name: 'Rafi Ahmed', avatar_url: null },
          },
        ],
      }),
    );
    renderPage();
    const panel = await screen.findByRole('region', { name: 'Committee' });
    expect(within(panel).getByText('Rafi Ahmed')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: /Assign member/ })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /End term/ })).toBeNull();
    expect(get).not.toHaveBeenCalledWith('/v1/clubs/3/committee', expect.anything());
  });
});

describe('committee panel, editors', () => {
  it('lists current rows with Edit and End term, and past rows under All terms', async () => {
    serve(deptAdmin(), [
      entry(),
      entry({
        id: 12,
        position: 'Treasurer',
        is_current: false,
        term_start_year: YEAR - 2,
        term_end_year: YEAR - 1,
        user: { id: 'u6', name: 'Old Member', avatar_url: null },
      }),
    ]);
    renderPage();
    const panel = await screen.findByRole('region', { name: 'Committee' });
    expect(await within(panel).findByText('Rafi Ahmed')).toBeTruthy();
    expect(within(panel).queryByText('Old Member')).toBeNull();
    expect(within(panel).getByRole('button', { name: /End term for Rafi Ahmed/ })).toBeTruthy();

    fireEvent.click(within(panel).getByRole('button', { name: 'All terms' }));
    const old = (await within(panel).findByText('Old Member')).closest('tr')!;
    expect(within(old).getByText('Ended')).toBeTruthy();
    expect(within(old).queryByRole('button', { name: /End term/ })).toBeNull();
    expect(
      within(panel).getByRole('button', { name: 'All terms' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('a super admin manages any club', async () => {
    serve(superAdminProfile());
    renderPage();
    expect(await screen.findByRole('button', { name: /Assign member/ })).toBeTruthy();
  });

  it('shows an error state when the committee fails to load', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/v1/users/me') return ok(deptAdmin());
      if (url === '/v1/clubs/3') return ok(club());
      throw apiError(500, 'INTERNAL', 'boom');
    });
    renderPage();
    // The hook retries a 5xx once before giving up.
    expect(
      await screen.findByText("Couldn't load the committee.", undefined, { timeout: 5000 }),
    ).toBeTruthy();
  });

  it('says when no one holds a position', async () => {
    serve(deptAdmin(), []);
    renderPage();
    expect(await screen.findByText(/No one holds a position right now/)).toBeTruthy();
  });
});

describe('assign dialog', () => {
  async function openAssign() {
    serve(deptAdmin(), []);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Assign member/ }));
    return screen.findByRole('dialog', { name: 'Assign a committee member' });
  }

  it('asks for a person before submitting, and checks the year order', async () => {
    const dialog = await openAssign();
    fireEvent.change(within(dialog).getByLabelText('Position'), { target: { value: 'President' } });
    fireEvent.change(within(dialog).getByLabelText('Term ends (year)'), {
      target: { value: String(YEAR - 1) },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Assign/ }));
    expect(await within(dialog).findByText('Choose the person to assign.')).toBeTruthy();
    expect(within(dialog).getByText('The end year cannot be before the start year.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('searches after a pause, disables seated people, and assigns', async () => {
    const dialog = await openAssign();
    fireEvent.change(within(dialog).getByLabelText('Person: search'), { target: { value: 'na' } });
    expect(get).not.toHaveBeenCalledWith('/v1/clubs/3/committee/candidates', expect.anything());

    const nadia = await within(dialog).findByRole(
      'radio',
      { name: /Nadia Islam/ },
      { timeout: 2000 },
    );
    expect(get).toHaveBeenCalledWith('/v1/clubs/3/committee/candidates', {
      params: { search: 'na' },
    });
    expect(
      (within(dialog).getByRole('radio', { name: /Rafi Ahmed/ }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(within(dialog).getByText('Already on the committee')).toBeTruthy();

    fireEvent.click(nadia);
    fireEvent.change(within(dialog).getByLabelText('Position'), { target: { value: 'Treasurer' } });
    post.mockResolvedValue(
      ok(
        entry({
          id: 20,
          position: 'Treasurer',
          user: { id: CANDIDATES[0]!.id, name: 'Nadia Islam', avatar_url: null },
        }),
      ),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign Nadia Islam' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/clubs/3/committee', {
        user_id: CANDIDATES[0]!.id,
        position: 'Treasurer',
        term_start_year: YEAR,
        term_end_year: YEAR + 1,
        is_current: true,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Nadia Islam assigned as Treasurer.'),
    );
  });

  it('puts an ALREADY_ON_COMMITTEE refusal on the person field', async () => {
    const dialog = await openAssign();
    fireEvent.change(within(dialog).getByLabelText('Person: search'), { target: { value: 'na' } });
    fireEvent.click(
      await within(dialog).findByRole('radio', { name: /Nadia Islam/ }, { timeout: 2000 }),
    );
    fireEvent.change(within(dialog).getByLabelText('Position'), { target: { value: 'President' } });
    post.mockRejectedValue(
      apiError(
        409,
        'ALREADY_ON_COMMITTEE',
        'This user already holds a current position in this club.',
      ),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign Nadia Islam' }));
    expect(
      await within(dialog).findByText('This user already holds a current position in this club.'),
    ).toBeTruthy();
    expect(within(dialog).queryByText('No one was assigned.')).toBeNull();
  });
});

describe('edit and end term', () => {
  it('sends only the changed fields', async () => {
    serve(deptAdmin());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Edit Rafi Ahmed's position/ }));
    const dialog = await screen.findByRole('dialog', { name: /Edit Rafi Ahmed's position/ });
    const save = within(dialog).getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Position'), {
      target: { value: 'Vice President' },
    });
    patch.mockResolvedValue(ok(entry({ position: 'Vice President' })));
    fireEvent.click(save);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/clubs/3/committee/11', {
        position: 'Vice President',
      }),
    );
  });

  it('ends a term after confirmation, and shows a 409 in the dialog', async () => {
    serve(deptAdmin());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /End term for Rafi Ahmed/ }));
    const dialog = await screen.findByRole('dialog', {
      name: /End Rafi Ahmed's term as President/,
    });
    expect(within(dialog).getByText(/unless they hold another current term/)).toBeTruthy();

    patch.mockRejectedValueOnce(
      apiError(409, 'TERM_ALREADY_ENDED', 'This committee term has already ended.'),
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'End term' }));
    expect(await within(dialog).findByText('This committee term has already ended.')).toBeTruthy();

    patch.mockResolvedValueOnce(ok(entry({ is_current: false })));
    fireEvent.click(within(dialog).getByRole('button', { name: 'End term' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Rafi Ahmed's term as President ended."),
    );
    expect(patch).toHaveBeenLastCalledWith('/v1/clubs/3/committee/11/end-term');
  });
});
