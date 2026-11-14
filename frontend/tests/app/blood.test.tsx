import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  BloodRequest,
  Donation,
  Donor,
  UnverifiedDonation,
  UserProfile,
} from '@uniconnect/shared';
import { BloodVerificationsView } from '@/app/(app)/dashboard/admin/blood-verifications/_components/blood-verifications-view';
import { BloodHubView } from '@/app/(app)/dashboard/blood/_components/blood-hub-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { addDaysIso } from './blood-dates';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, studentProfile, superAdminProfile } from './utils';

let search = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/blood',
  useSearchParams: () => search,
  useParams: () => ({}),
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
const deptAdminProfile = () => facultyProfile({ id: 'admin1', role: 'dept_admin' });

function request_(overrides: Partial<BloodRequest> = {}): BloodRequest {
  return {
    id: 5,
    patient_name: 'Rahim Uddin',
    blood_group: 'O-',
    units_needed: 2,
    reason: 'Surgery',
    contact_phone: '+8801711111111',
    hospital_name: 'Dhaka Medical',
    required_by_date: addDaysIso(3),
    status: 'pending',
    requester: { id: 'r1', name: 'Tanvir Ahmed', department: CSE },
    fulfiller: null,
    created_at: '2026-11-14T08:00:00.000Z',
    resolved_at: null,
    can_fulfill: true,
    can_cancel: false,
    ...overrides,
  };
}

const donor_ = (overrides: Partial<Donor> = {}): Donor => ({
  id: 'd1',
  name: 'Nadia Islam',
  blood_group: 'AB+',
  department: CSE,
  last_donation_date: '2026-10-01',
  phone: '+8801700000001',
  verified: true,
  ...overrides,
});

const donation_ = (overrides: Partial<Donation> = {}): Donation => ({
  id: 11,
  blood_group: 'B+',
  donation_date: '2026-11-01',
  units: 1,
  hospital_name: 'Red Crescent',
  notes: null,
  verified: false,
  verified_at: null,
  verifier: null,
  created_at: '2026-11-01T10:00:00.000Z',
  ...overrides,
});

const unverified_ = (overrides: Partial<UnverifiedDonation> = {}): UnverifiedDonation => ({
  ...donation_(),
  donor: { id: 'u9', name: 'Tanvir Ahmed', student_id: 'CSE-22/7', department: CSE },
  ...overrides,
});

const page = <T,>(data: T[]) => ({
  data: { success: true, data, meta: { page: 1, limit: 20, total: data.length, total_pages: 1 } },
});
const apiError = (status: number, code: string, message = 'x', details?: unknown) =>
  axiosError(status, { success: false, error: { code, message, details } });

interface Serve {
  me?: UserProfile;
  requests?: BloodRequest[] | Error;
  donors?: Donor[];
  donations?: Donation[];
  unverified?: UnverifiedDonation[];
}

const calls: { url: string; params: unknown }[] = [];

function serve({
  me = studentProfile(),
  requests = [request_()],
  donors = [donor_()],
  donations = [donation_()],
  unverified = [unverified_()],
}: Serve = {}) {
  get.mockImplementation(async (url: string, config?: { params?: unknown }) => {
    calls.push({ url, params: config?.params });
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/departments') return ok([CSE, ECE]);
    if (url === '/v1/blood/requests') {
      if (requests instanceof Error) throw requests;
      return page(requests);
    }
    if (url === '/v1/blood/donors') return page(donors);
    if (url === '/v1/blood/donations/my') return page(donations);
    if (url === '/v1/admin/blood/donations/unverified') return page(unverified);
    throw new Error(`unexpected GET ${url}`);
  });
}

const renderHub = () => renderWithQuery(<Workspace>{<BloodHubView />}</Workspace>);
const renderQueue = () => renderWithQuery(<Workspace>{<BloodVerificationsView />}</Workspace>);

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  for (const spy of [get, post, patch]) spy.mockReset();
  jest.mocked(toast.success).mockReset();
  replace.mockReset();
  calls.length = 0;
  search = new URLSearchParams();
});

describe('blood hub: requests tab', () => {
  it('lists pending requests with group, contact and actions from the API flags', async () => {
    serve({
      requests: [
        request_(),
        request_({
          id: 6,
          patient_name: 'Own request',
          requester: { id: 'u1', name: 'Ayesha Rahman', department: CSE },
          can_fulfill: false,
          can_cancel: true,
        }),
      ],
    });
    renderHub();
    expect(await screen.findByRole('heading', { level: 1, name: 'Blood donation' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Requests/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
    const table = await screen.findByRole('table');
    expect(within(table).getAllByLabelText('Blood group O negative').length).toBeGreaterThan(0);
    expect(
      within(table).getAllByRole('link', { name: '+8801711111111' })[0]?.getAttribute('href'),
    ).toBe('tel:+8801711111111');
    expect(
      screen.getByRole('button', { name: 'Fulfill the request for Rahim Uddin' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel the request for Rahim Uddin' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel the request for Own request' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Fulfill the request for Own request' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'New blood request' })).toBeTruthy();
  });

  it('confirms before fulfilling, then toasts', async () => {
    serve();
    patch.mockResolvedValue(ok(request_({ status: 'fulfilled', can_fulfill: false })));
    renderHub();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Fulfill the request for Rahim Uddin' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Fulfill this request?' });
    expect(within(dialog).getByText(/doesn't record a donation/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as fulfilled' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Marked as fulfilled. Thank you.'),
    );
    expect(patch).toHaveBeenCalledWith('/v1/blood/requests/5/fulfill');
  });

  it('shows the API refusal when someone else got there first (409)', async () => {
    serve();
    patch.mockRejectedValue(
      apiError(409, 'BLOOD_REQUEST_NOT_PENDING', 'This request is no longer open.'),
    );
    renderHub();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Fulfill the request for Rahim Uddin' }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as fulfilled' }));
    expect(await within(dialog).findByText('This request is no longer open.')).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('offers Clear filters on an empty filtered result', async () => {
    search = new URLSearchParams('r_blood_group=AB-&r_page=2');
    serve({ requests: [] });
    renderHub();
    expect(await screen.findByText('No requests match these filters')).toBeTruthy();
    expect(calls.find((c) => c.url === '/v1/blood/requests')?.params).toEqual({
      blood_group: 'AB-',
      page: 2,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(replace).toHaveBeenCalledWith('/dashboard/blood', { scroll: false });
  });

  it('shows an error state with Try again', async () => {
    serve({ requests: apiError(400, 'BAD', 'nope') });
    renderHub();
    expect(await screen.findByText("Couldn't load blood requests.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('new blood request dialog', () => {
  async function open() {
    serve({ me: studentProfile({ phone: '+8801799999999' }) });
    renderHub();
    fireEvent.click(await screen.findByRole('button', { name: 'New blood request' }));
    return screen.findByRole('dialog', { name: 'New blood request' });
  }

  it('validates, refuses a past date, and prefills the profile phone', async () => {
    const dialog = await open();
    expect((within(dialog).getByLabelText('Contact phone') as HTMLInputElement).value).toBe(
      '+8801799999999',
    );
    fireEvent.change(within(dialog).getByLabelText('Needed by'), {
      target: { value: addDaysIso(-1) },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post request' }));
    expect(await within(dialog).findByText('Patient name is required.')).toBeTruthy();
    expect(within(dialog).getByText('Choose a blood group.')).toBeTruthy();
    expect(within(dialog).getByText('Hospital name is required.')).toBeTruthy();
    expect(within(dialog).getByText('The required-by date must be today or later.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('posts only the API fields', async () => {
    post.mockResolvedValue(ok(request_()));
    const dialog = await open();
    fireEvent.change(within(dialog).getByLabelText('Patient name'), {
      target: { value: ' Rahim ' },
    });
    fireEvent.change(within(dialog).getByLabelText('Blood group'), { target: { value: 'O-' } });
    fireEvent.change(within(dialog).getByLabelText('Units needed'), { target: { value: '3' } });
    fireEvent.change(within(dialog).getByLabelText('Hospital'), {
      target: { value: 'Dhaka Medical' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post request' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Blood request posted.'));
    expect(post).toHaveBeenCalledWith('/v1/blood/requests', {
      patient_name: 'Rahim',
      blood_group: 'O-',
      units_needed: 3,
      contact_phone: '+8801799999999',
      hospital_name: 'Dhaka Medical',
      required_by_date: addDaysIso(0),
    });
  });
});

describe('blood hub: donors tab', () => {
  it('shows phone as a tel: link, never an email, and toggles verified only in the URL', async () => {
    search = new URLSearchParams('tab=donors');
    serve({
      donors: [donor_(), donor_({ id: 'd2', name: 'No Phone', phone: null, verified: false })],
    });
    renderHub();
    const table = await screen.findByRole('table');
    expect(
      within(table).getAllByRole('link', { name: '+8801700000001' })[0]?.getAttribute('href'),
    ).toBe('tel:+8801700000001');
    expect(within(table).getAllByText('Not shared').length).toBeGreaterThan(0);
    expect(within(table).getByText('Unverified')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/@example\.com|e-?mail/i);
    // No header action on the donors tab.
    expect(screen.queryByRole('button', { name: 'New blood request' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Verified only' }));
    expect(replace).toHaveBeenCalledWith('/dashboard/blood?tab=donors&d_verified_only=true', {
      scroll: false,
    });
  });
});

describe('blood hub: my donations tab', () => {
  it('is not offered to a super admin', async () => {
    search = new URLSearchParams('tab=donations');
    serve({ me: superAdminProfile() });
    renderHub();
    expect(await screen.findByRole('tab', { name: /Requests/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /My donations/ })).toBeNull();
    // Falls back to Requests.
    expect(screen.getByRole('tab', { name: /Requests/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('lists records with their status and the donor summary', async () => {
    search = new URLSearchParams('tab=donations');
    serve({
      me: studentProfile({ last_donation_date: '2026-09-20' }),
      donations: [
        donation_(),
        donation_({
          id: 12,
          verified: true,
          verified_at: '2026-10-02T10:00:00.000Z',
          verifier: { id: 'a', name: 'Admin' },
        }),
      ],
    });
    renderHub();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Pending')).toBeTruthy();
    expect(within(table).getByText('Verified')).toBeTruthy();
    expect(screen.getByText('SYS.BLOOD.DONOR')).toBeTruthy();
    expect(screen.getByText('20 Sept 2026')).toBeTruthy();
  });

  it('records a donation with the profile blood group and refuses a future date', async () => {
    search = new URLSearchParams('tab=donations');
    serve({ donations: [] });
    post.mockResolvedValue(ok(donation_()));
    renderHub();
    fireEvent.click(await screen.findByRole('button', { name: 'Record donation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record donation' });
    expect(within(dialog).getByLabelText('Blood group B positive')).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText('Donation date'), {
      target: { value: addDaysIso(1) },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record donation' }));
    expect(
      await within(dialog).findByText('The donation date cannot be in the future.'),
    ).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Donation date'), {
      target: { value: addDaysIso(-2) },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Record donation' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Donation recorded. It counts once an admin verifies it.',
      ),
    );
    expect(post).toHaveBeenCalledWith('/v1/blood/donations', {
      donation_date: addDaysIso(-2),
      units: 1,
    });
  });
});

describe('admin blood verifications', () => {
  it('refuses a student', async () => {
    serve();
    renderQueue();
    expect(await screen.findByText("You don't have access to this page.")).toBeTruthy();
    expect(calls.some((c) => c.url === '/v1/admin/blood/donations/unverified')).toBe(false);
  });

  it('lets a dept admin verify after confirming, with no department filter', async () => {
    serve({ me: deptAdminProfile() });
    patch.mockResolvedValue(ok(donation_({ verified: true })));
    renderQueue();
    fireEvent.click(await screen.findByRole('button', { name: "Verify Tanvir Ahmed's donation" }));
    expect(screen.queryByLabelText('Department')).toBeNull();
    const dialog = await screen.findByRole('dialog', { name: 'Verify this donation?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Verify donation' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Verified Tanvir Ahmed's donation."),
    );
    expect(patch).toHaveBeenCalledWith('/v1/blood/donations/11/verify');
  });

  it("disables Verify on the admin's own donation, with the reason", async () => {
    serve({
      me: deptAdminProfile(),
      unverified: [
        unverified_({
          donor: { id: 'admin1', name: 'Dr. Karim Hossain', student_id: null, department: CSE },
        }),
      ],
    });
    renderQueue();
    const button = await screen.findByRole('button', { name: 'Verify your own donation' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("You can't verify your own donation.")).toBeTruthy();
  });

  it('gives a super admin the department filter', async () => {
    serve({ me: superAdminProfile() });
    renderQueue();
    expect(await screen.findByLabelText('Department')).toBeTruthy();
    expect(await screen.findByRole('table')).toBeTruthy();
  });
});
