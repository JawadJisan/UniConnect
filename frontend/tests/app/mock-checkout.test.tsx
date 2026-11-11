import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MockCheckoutView } from '@/app/(app)/dashboard/memberships/checkout/mock/mock-checkout-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { renderWithQuery } from '../auth/utils';
import { ok, studentProfile } from './utils';

let search = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/memberships/checkout/mock',
  useSearchParams: () => search,
}));

const get = jest.spyOn(api, 'get');
const post = jest.spyOn(api, 'post');

const renderPage = () =>
  renderWithQuery(
    <Workspace>
      <MockCheckoutView />
    </Workspace>,
  );

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset().mockImplementation(async () => ok(studentProfile()));
  post.mockReset().mockResolvedValue(ok({ received: true }));
  replace.mockReset();
  search = new URLSearchParams('tran_id=UC-20261111-ABC&amount=500.00');
});

describe('mock checkout', () => {
  it('shows the transaction and amount in a sandbox readout', async () => {
    renderPage();
    expect(await screen.findByText('tran_id UC-20261111-ABC')).toBeTruthy();
    expect(screen.getByText('amount ৳500.00 BDT')).toBeTruthy();
    expect(screen.getByText('Sandbox', { selector: 'span' })).toBeTruthy();
  });

  it('posts a valid IPN, then returns to the membership page as a success', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Simulate payment success' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/memberships/payment/ipn', {
        tran_id: 'UC-20261111-ABC',
        val_id: 'MOCK-VALID-UC-20261111-ABC-500.00-BDT',
        status: 'VALID',
      }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/dashboard/memberships?checkout=success'),
    );
  });

  it('posts a failed IPN for Simulate failure', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Simulate failure' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/memberships/payment/ipn', {
        tran_id: 'UC-20261111-ABC',
        val_id: 'MOCK-FAILED-UC-20261111-ABC',
        status: 'FAILED',
      }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/dashboard/memberships?checkout=failed'),
    );
  });

  it('cancels without any IPN', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel payment' }));
    expect(replace).toHaveBeenCalledWith('/dashboard/memberships?checkout=cancelled');
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses an incomplete link', async () => {
    search = new URLSearchParams('tran_id=UC-1&amount=abc');
    renderPage();
    expect(await screen.findByText('This checkout link is incomplete.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Simulate payment success' })).toBeNull();
  });
});
