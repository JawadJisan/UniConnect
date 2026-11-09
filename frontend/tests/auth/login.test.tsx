import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoginView } from '@/app/(auth)/login/login-view';
import { authClient, resetAuthClient } from '../mocks/auth-client';
import { fill, pending } from './utils';

const replace = jest.fn();
const refresh = jest.fn();
let search = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh }),
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  resetAuthClient();
  replace.mockReset();
  refresh.mockReset();
  search = '';
});

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

function fillValid() {
  fill('Email', '  Ayesha@Example.com ');
  fill('Password', 'Str0ng!pass');
}

describe('login page', () => {
  it('shows where the visitor is in the flow', () => {
    render(<LoginView />);
    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeTruthy();
    const trail = screen.getByRole('navigation', { name: 'Account setup' });
    expect(trail.querySelector('[aria-current="step"]')?.textContent).toBe('Sign in');
    // A cold visit can't know the earlier steps happened, so nothing is ticked.
    expect(trail.textContent).not.toContain('(done)');
  });

  it('ticks register and verify after the verification redirect', () => {
    search = 'verified=true';
    render(<LoginView />);
    const trail = screen.getByRole('navigation', { name: 'Account setup' });
    expect(trail.textContent?.match(/\(done\)/g)).toHaveLength(2);
  });

  it('validates before calling the API', async () => {
    render(<LoginView />);
    submit();

    expect(await screen.findByText('Enter your password.')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Password').getAttribute('aria-invalid')).toBe('true');
    expect(authClient.signIn.email).not.toHaveBeenCalled();
  });

  it('signs in with the normalised email and goes to the dashboard', async () => {
    render(<LoginView />);
    fillValid();
    submit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    expect(authClient.signIn.email).toHaveBeenCalledWith({
      email: 'ayesha@example.com',
      password: 'Str0ng!pass',
    });
  });

  it('returns to the page that sent the visitor here', async () => {
    search = 'next=%2Fdashboard%2Fprofile';
    render(<LoginView />);
    fillValid();
    submit();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/profile'));
  });

  it.each(['https://evil.example/', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)'])(
    'ignores an off-site next (%s)',
    async (next) => {
      search = `next=${encodeURIComponent(next)}`;
      render(<LoginView />);
      fillValid();
      submit();
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    },
  );

  it('disables the button while signing in', async () => {
    authClient.signIn.email.mockImplementation(pending);
    render(<LoginView />);
    fillValid();
    submit();

    const button = await screen.findByRole('button', { name: 'Logging in…' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('says plainly when the email or password is wrong', async () => {
    authClient.signIn.email.mockResolvedValue({
      data: null,
      error: {
        status: 401,
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: 'Invalid email or password',
      },
    });
    render(<LoginView />);
    fillValid();
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Email or password is incorrect.',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('explains a suspended account', async () => {
    authClient.signIn.email.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'ACCOUNT_SUSPENDED' },
    });
    render(<LoginView />);
    fillValid();
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain('This account is suspended.');
  });

  it('offers a new verification link to an unverified user', async () => {
    authClient.signIn.email.mockResolvedValue({
      data: null,
      error: { status: 403, code: 'EMAIL_NOT_VERIFIED' },
    });
    render(<LoginView />);
    fillValid();
    submit();

    expect(await screen.findByText('Confirm your email first.')).toBeTruthy();
    const trail = screen.getByRole('navigation', { name: 'Account setup' });
    expect(trail.querySelector('[aria-current="step"]')?.textContent).toBe('Verify email');
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

    await waitFor(() =>
      expect(authClient.sendVerificationEmail).toHaveBeenCalledWith({
        email: 'ayesha@example.com',
        callbackURL: '/login?verified=true',
      }),
    );
    expect(await screen.findByText('Sent. Check ayesha@example.com for a new link.')).toBeTruthy();
  });

  it('confirms a verified email on arrival', () => {
    search = 'verified=true';
    render(<LoginView />);
    expect(screen.getByRole('status').textContent).toContain('Email confirmed.');
  });

  it('explains an expired verification link', () => {
    search = 'verified=true&error=TOKEN_EXPIRED';
    render(<LoginView />);
    expect(screen.getByRole('alert').textContent).toContain('That verification link has expired.');
  });

  it('explains an invalid verification link', () => {
    search = 'verified=true&error=INVALID_TOKEN';
    render(<LoginView />);
    expect(screen.getByRole('alert').textContent).toContain("That verification link isn't valid.");
  });

  it('confirms a password reset on arrival', () => {
    search = 'reset=success';
    render(<LoginView />);
    expect(screen.getByRole('status').textContent).toContain('Password updated.');
  });
});
