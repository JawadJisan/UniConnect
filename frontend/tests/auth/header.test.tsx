import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SiteHeader } from '@/app/_components/site-header';
import { authClient, resetAuthClient, setSession } from '../mocks/auth-client';

const refresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh }),
}));

beforeEach(() => {
  resetAuthClient();
  refresh.mockReset();
});

describe('site header session state', () => {
  it('shows Log in and Sign up when signed out', () => {
    render(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');
    expect(screen.getByRole('link', { name: 'Sign up' }).getAttribute('href')).toBe('/register');
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('keeps the signed-out links while the session loads', () => {
    setSession(null, true);
    render(<SiteHeader />);
    expect(screen.getByRole('link', { name: 'Log in' })).toBeTruthy();
  });

  it('shows the name and signs out when signed in', async () => {
    setSession({
      session: { id: 's1' },
      user: { id: 'u1', name: 'Ayesha Rahman', email: 'ayesha@example.com' },
    });
    render(<SiteHeader />);

    expect(screen.getByText('Ayesha Rahman')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Log in' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(authClient.signOut).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });
});
