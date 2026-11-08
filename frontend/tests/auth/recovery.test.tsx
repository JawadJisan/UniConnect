import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ForgotPasswordView } from '@/app/(auth)/forgot-password/forgot-password-view';
import { ResetPasswordView } from '@/app/(auth)/reset-password/reset-password-view';
import { VerifyEmailView } from '@/app/(auth)/verify-email/verify-email-view';
import { authClient, resetAuthClient } from '../mocks/auth-client';
import { fill, pending } from './utils';

const replace = jest.fn();
let search = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  resetAuthClient();
  replace.mockReset();
  search = '';
});

describe('verify-email page', () => {
  it('names the address the link went to', () => {
    search = 'email=ayesha%40example.com';
    render(<VerifyEmailView />);
    expect(screen.getByRole('heading', { level: 1, name: 'Check your inbox' })).toBeTruthy();
    expect(screen.getByText('ayesha@example.com')).toBeTruthy();
  });

  it('resends and starts the cooldown', async () => {
    search = 'email=ayesha%40example.com';
    render(<VerifyEmailView />);
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

    expect(await screen.findByText('Sent. Check ayesha@example.com for a new link.')).toBeTruthy();
    expect(screen.getByText(/Next link in [45]:\d\d/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Resend verification email' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('explains the per-address limit on 429', async () => {
    authClient.sendVerificationEmail.mockResolvedValue({
      data: null,
      error: { status: 429, code: 'RATE_LIMITED' },
    });
    search = 'email=ayesha%40example.com';
    render(<VerifyEmailView />);
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));

    expect(
      await screen.findByText(/A link was sent to this address in the last 5 minutes/),
    ).toBeTruthy();
  });

  it('asks for the address when the URL has none', async () => {
    render(<VerifyEmailView />);
    fill('Email you registered with', 'not-an-email');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter the email you registered with.')).toBeTruthy();

    fill('Email you registered with', 'ayesha@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: 'Resend verification email' })).toBeTruthy();
  });
});

describe('forgot-password page', () => {
  it('validates the email', async () => {
    render(<ForgotPasswordView />);
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true'),
    );
    expect(authClient.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('requests a link back to /reset-password and answers without revealing the account', async () => {
    render(<ForgotPasswordView />);
    fill('Email', 'Ayesha@Example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText(/If an account exists for/)).toBeTruthy();
    expect(authClient.requestPasswordReset).toHaveBeenCalledWith({
      email: 'ayesha@example.com',
      redirectTo: '/reset-password',
    });
  });

  it('disables the button while sending', async () => {
    authClient.requestPasswordReset.mockImplementation(pending);
    render(<ForgotPasswordView />);
    fill('Email', 'ayesha@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect((await screen.findByRole('button', { name: 'Sending…' })).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('explains the per-address limit on 429', async () => {
    authClient.requestPasswordReset.mockResolvedValue({
      data: null,
      error: { status: 429, code: 'RATE_LIMITED' },
    });
    render(<ForgotPasswordView />);
    fill('Email', 'ayesha@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Too many reset requests');
  });
});

describe('reset-password page', () => {
  it('names exactly what a weak password lacks', async () => {
    search = 'token=abc';
    render(<ResetPasswordView />);
    fill(/^New password/, 'short1');
    fill('Confirm new password', 'short1');
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(
      await screen.findByText(
        'Use at least 8 characters, and add an uppercase letter and a symbol.',
      ),
    ).toBeTruthy();
    expect(authClient.resetPassword).not.toHaveBeenCalled();
  });

  it('shows the invalid-link state without a token', () => {
    render(<ResetPasswordView />);
    expect(screen.getByRole('heading', { name: "This reset link doesn't work" })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Get a new link' }).getAttribute('href')).toBe(
      '/forgot-password',
    );
  });

  it('shows the invalid-link state for ?error=INVALID_TOKEN', () => {
    search = 'error=INVALID_TOKEN';
    render(<ResetPasswordView />);
    expect(screen.getByRole('heading', { name: "This reset link doesn't work" })).toBeTruthy();
  });

  it('checks the policy and that both passwords match', async () => {
    search = 'token=abc';
    render(<ResetPasswordView />);
    fill(/^New password/, 'Str0ng!pass');
    fill('Confirm new password', 'Str0ng!pasz');
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(await screen.findByText('Passwords do not match.')).toBeTruthy();
    expect(authClient.resetPassword).not.toHaveBeenCalled();
  });

  it('saves with the token and sends the user to log in', async () => {
    search = 'token=abc';
    render(<ResetPasswordView />);
    fill(/^New password/, 'Str0ng!pass');
    fill('Confirm new password', 'Str0ng!pass');
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?reset=success'));
    expect(authClient.resetPassword).toHaveBeenCalledWith({
      newPassword: 'Str0ng!pass',
      token: 'abc',
    });
  });

  it('switches to the invalid-link state when the API rejects the token', async () => {
    authClient.resetPassword.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'INVALID_TOKEN' },
    });
    search = 'token=used';
    render(<ResetPasswordView />);
    fill(/^New password/, 'Str0ng!pass');
    fill('Confirm new password', 'Str0ng!pass');
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(
      await screen.findByRole('heading', { name: "This reset link doesn't work" }),
    ).toBeTruthy();
  });
});
