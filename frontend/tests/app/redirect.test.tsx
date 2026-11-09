import { render, waitFor } from '@testing-library/react';
import { RedirectIfSignedIn } from '@/app/(auth)/_components/redirect-if-signed-in';
import { resetAuthClient, setSession } from '../mocks/auth-client';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
}));

const SESSION = { session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } };

beforeEach(() => {
  resetAuthClient();
  replace.mockReset();
  window.history.replaceState(null, '', '/login');
});

describe('redirect off the auth pages', () => {
  it('does nothing while signed out', () => {
    render(<RedirectIfSignedIn />);
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends a signed-in visitor to the dashboard', async () => {
    setSession(SESSION);
    render(<RedirectIfSignedIn />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('agrees with the login view on ?next=, so the two never race', async () => {
    window.history.replaceState(null, '', '/login?next=%2Fdashboard%2Fprofile');
    setSession(SESSION);
    render(<RedirectIfSignedIn />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/profile'));
  });

  it('ignores an off-site next', async () => {
    window.history.replaceState(null, '', '/login?next=%2F%2Fevil.example');
    setSession(SESSION);
    render(<RedirectIfSignedIn />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });
});
