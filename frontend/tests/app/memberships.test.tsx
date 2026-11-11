import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ClubDetail, MembershipSummary, UserProfile } from '@uniconnect/shared';
import { MembershipsView } from '@/app/(app)/dashboard/memberships/_components/memberships-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { todayInDhaka } from '@/lib/membership';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, pending, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, studentProfile } from './utils';

let search = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/memberships',
  useSearchParams: () => search,
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

// window.location.assign can't be spied on in jsdom, so the redirect module is replaced.
const assign = jest.fn();
jest.mock('@/lib/checkout-redirect', () => ({ goToCheckout: (url: string) => assign(url) }));

const get = jest.spyOn(api, 'get');
const post = jest.spyOn(api, 'post');
const patch = jest.spyOn(api, 'patch');

const CSE = { id: 1, name: 'CSE' };
const today = todayInDhaka();

function club(overrides: Partial<ClubDetail> = {}): ClubDetail {
  return {
    id: 3,
    name: 'CSE Club',
    description: null,
    logo_url: null,
    membership_fee_monthly: '500.00',
    membership_fee_yearly: '5000.00',
    department: CSE,
    updated_at: '2026-11-10T10:00:00.000Z',
    committee: [],
    ...overrides,
  };
}

let nextId = 1;
function membership(overrides: Partial<MembershipSummary> = {}): MembershipSummary {
  const id = nextId++;
  return {
    id,
    type: 'monthly',
    status: 'active',
    start_date: '2026-11-11',
    end_date: '2026-12-10',
    created_at: '2026-11-11T08:00:00.000Z',
    club: { id: 3, name: 'CSE Club', logo_url: null, department: CSE },
    payment: {
      transaction_id: `UC-20261111-${String(id).padStart(12, '0')}`,
      amount: '500.00',
      currency: 'BDT',
      status: 'completed',
      validated_at: '2026-11-11T08:01:00.000Z',
    },
    ...overrides,
  };
}

function serve({
  me = studentProfile() as UserProfile,
  myClub = club() as unknown,
  mine = [] as unknown,
}: { me?: UserProfile; myClub?: unknown; mine?: unknown } = {}) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/clubs/my-club') {
      if (myClub instanceof Error) throw myClub;
      return ok(myClub);
    }
    if (url === '/v1/memberships/my') {
      if (mine instanceof Error) throw mine;
      const data = mine as MembershipSummary[];
      return {
        data: {
          success: true,
          data,
          meta: { page: 1, limit: 100, total: data.length, total_pages: 1 },
        },
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

const renderPage = () =>
  renderWithQuery(
    <Workspace>
      <MembershipsView />
    </Workspace>,
  );
const apiError = (status: number, code: string, message = 'x') =>
  axiosError(status, { success: false, error: { code, message } });
const statusCard = async () =>
  (await screen.findByRole('heading', { name: /CSE Club/, level: 2 })).closest('section')!;

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  replace.mockReset();
  assign.mockReset();
  jest.mocked(toast.success).mockReset();
  search = new URLSearchParams();
  nextId = 1;
});

describe('membership status card', () => {
  it('offers a purchase when there is no membership', async () => {
    serve();
    renderPage();
    const card = await statusCard();
    expect(within(card).getByText(/You're not a member of CSE Club/)).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Purchase membership' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Renew' })).toBeNull();
    expect(screen.getByText('No memberships yet')).toBeTruthy();
  });

  it('shows an active membership with its status, plan, period and time left', async () => {
    serve({ mine: [membership({ start_date: today, end_date: '2099-12-31' })] });
    renderPage();
    const card = await statusCard();
    expect(within(card).getByText('Active')).toBeTruthy();
    expect(within(card).getByText('Monthly')).toBeTruthy();
    expect(within(card).getByText('EXPIRES IN')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Renew' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Cancel membership' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Purchase membership' })).toBeNull();
  });

  it('hides Renew once a renewal is scheduled, and says when it starts', async () => {
    serve({
      mine: [
        membership({ status: 'scheduled', start_date: '2026-12-11', end_date: '2027-01-10' }),
        membership(),
      ],
    });
    renderPage();
    const card = await statusCard();
    expect(within(card).queryByRole('button', { name: 'Renew' })).toBeNull();
    expect(within(card).getByText(/Your renewal is paid and starts on/)).toBeTruthy();
    expect(within(card).getByText('11 Dec 2026')).toBeTruthy();
  });

  it('shows a pending checkout with Cancel checkout and no purchase', async () => {
    serve({ mine: [membership({ status: 'pending', payment: null })] });
    renderPage();
    const card = await statusCard();
    expect(within(card).getByText('Pending')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Cancel checkout' })).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Purchase membership' })).toBeNull();
  });

  it('disables Purchase and says why when the club has no fee', async () => {
    serve({ myClub: club({ membership_fee_monthly: null, membership_fee_yearly: null }) });
    renderPage();
    const card = await statusCard();
    const buy = within(card).getByRole('button', { name: 'Purchase membership' });
    expect((buy as HTMLButtonElement).disabled).toBe(true);
    expect(within(card).getByText(/hasn't set a membership fee yet/)).toBeTruthy();
  });

  it('tells faculty memberships are for students, without calling the API', async () => {
    serve({ me: facultyProfile() });
    renderPage();
    expect(await screen.findByText('Memberships are for students.')).toBeTruthy();
    expect(get).not.toHaveBeenCalledWith('/v1/memberships/my', expect.anything());
  });

  it('shows an error with a retry when the list fails', async () => {
    serve({ mine: apiError(500, 'INTERNAL') });
    renderPage();
    expect(
      await screen.findByText("Couldn't load your memberships.", {}, { timeout: 4000 }),
    ).toBeTruthy();
  });

  it('shows a loading state first', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/v1/users/me') return ok(studentProfile());
      return pending();
    });
    renderPage();
    expect(await screen.findByText('Loading your membership…')).toBeTruthy();
  });
});

describe('plan dialog', () => {
  it('starts a checkout for the chosen plan and sends the browser to the gateway', async () => {
    serve();
    post.mockResolvedValue(
      ok({
        membership: membership({ status: 'pending' }),
        transaction_id: 'UC-1',
        redirect_url: '/dashboard/memberships/checkout/mock?tran_id=UC-1&amount=5000.00',
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Purchase membership' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('৳500.00')).toBeTruthy();
    expect(within(dialog).getByText('৳5,000.00')).toBeTruthy();
    fireEvent.click(within(dialog).getByLabelText(/Yearly/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to payment' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/memberships', { club_id: 3, type: 'yearly' }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        '/dashboard/memberships/checkout/mock?tran_id=UC-1&amount=5000.00',
      ),
    );
  });

  it('disables a plan whose fee is not set', async () => {
    serve({ myClub: club({ membership_fee_yearly: null }) });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Purchase membership' }));
    const dialog = await screen.findByRole('dialog');
    expect((within(dialog).getByLabelText(/Yearly/) as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText(/Monthly/) as HTMLInputElement).checked).toBe(true);
  });

  it('shows the API message in the dialog when the checkout is refused', async () => {
    serve();
    post.mockRejectedValue(
      apiError(409, 'CHECKOUT_IN_PROGRESS', 'You already have a checkout in progress.'),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Purchase membership' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to payment' }));
    expect(
      await within(dialog).findByText('You already have a checkout in progress.'),
    ).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });

  it('renews from the current membership, starting the day after it ends', async () => {
    const current = membership({ end_date: '2099-12-31' });
    serve({ mine: [current] });
    post.mockResolvedValue(
      ok({
        membership: membership({ status: 'pending' }),
        transaction_id: 'UC-2',
        redirect_url: '/x',
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Renew' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/starts on 1 Jan 2100/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue to payment' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(`/v1/memberships/${current.id}/renew`, { type: 'monthly' }),
    );
  });
});

describe('cancel', () => {
  it('confirms, states there is no refund, and cancels', async () => {
    const current = membership({ end_date: '2099-12-31' });
    serve({ mine: [current] });
    patch.mockResolvedValue(ok({ ...current, status: 'cancelled' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel membership' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/not refunded/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel membership' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith(`/v1/memberships/${current.id}/cancel`));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Membership cancelled.'));
  });
});

describe('history', () => {
  it('lists every membership with uppercase status, mono amounts and the transaction', async () => {
    const rows = [
      membership({ status: 'active' }),
      membership({
        status: 'expired',
        type: 'yearly',
        payment: {
          transaction_id: 'UC-OLD',
          amount: '5000.00',
          currency: 'BDT',
          status: 'completed',
          validated_at: null,
        },
      }),
      membership({ status: 'cancelled', payment: null }),
    ];
    serve({ mine: rows });
    renderPage();
    const table = await screen.findByRole('table', { name: 'Your memberships, newest first' });
    const body = within(table).getAllByRole('row').slice(1);
    expect(body).toHaveLength(3);
    expect(within(body[1]!).getByText('Expired')).toBeTruthy();
    expect(within(body[1]!).getByText('৳5,000.00')).toBeTruthy();
    expect(within(body[1]!).getByText('UC-OLD')).toBeTruthy();
    expect(within(body[2]!).getByText('Cancelled')).toBeTruthy();
    expect(within(body[2]!).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('pages on the client after 10 rows', async () => {
    serve({ mine: Array.from({ length: 12 }, () => membership({ status: 'expired' })) });
    renderPage();
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText('1–10 of 12')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await waitFor(() => expect(screen.getByText('11–12 of 12')).toBeTruthy());
  });
});

describe('checkout return', () => {
  it('shows the display-only banner, then a toast once the payment is confirmed', async () => {
    search = new URLSearchParams('checkout=success');
    serve({ mine: [membership({ status: 'active' })] });
    renderPage();
    expect(await screen.findByText('Payment received.')).toBeTruthy();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("You're a member of CSE Club."));
    expect(replace).toHaveBeenCalledWith('/dashboard/memberships', { scroll: false });
  });

  it('says nothing was charged after a failed payment', async () => {
    search = new URLSearchParams('checkout=failed');
    serve();
    renderPage();
    expect(await screen.findByText("The payment didn't go through.")).toBeTruthy();
  });
});
