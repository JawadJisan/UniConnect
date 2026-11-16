import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  AvatarUpload,
  avatarFileProblem,
} from '@/app/(app)/dashboard/profile/_components/avatar-upload';
import { PasswordForm } from '@/app/(app)/dashboard/profile/_components/password-form';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { authClient, resetAuthClient } from '../mocks/auth-client';
import { axiosError, fill, pending, renderWithQuery } from '../auth/utils';
import { fakeFile, ok, studentProfile } from './utils';

jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const patch = jest.spyOn(api, 'patch');
const createObjectURL = jest.fn(() => 'blob:preview-1');
const revokeObjectURL = jest.fn();

beforeAll(() => {
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});
beforeEach(() => {
  resetAuthClient();
  patch.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  jest.mocked(toast.success).mockReset();
});

const MB = 1024 * 1024;

function pick(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('avatar file checks', () => {
  it.each([
    ['a JPEG', fakeFile('a.jpg', 'image/jpeg'), null],
    ['a PNG', fakeFile('a.png', 'image/png'), null],
    ['a WebP', fakeFile('a.webp', 'image/webp'), null],
    ['a GIF', fakeFile('a.gif', 'image/gif'), 'Choose a JPEG, PNG or WebP image.'],
    ['an SVG', fakeFile('a.svg', 'image/svg+xml'), 'Choose a JPEG, PNG or WebP image.'],
  ])('%s', (_label, file, expected) => {
    expect(avatarFileProblem(file)).toBe(expected);
  });

  it('rejects anything over 5 MB and says how big it was', () => {
    expect(avatarFileProblem(fakeFile('big.jpg', 'image/jpeg', 6 * MB))).toBe(
      'That image is 6.0 MB. Choose one up to 5 MB.',
    );
    expect(avatarFileProblem(fakeFile('ok.jpg', 'image/jpeg', 5 * MB))).toBeNull();
  });
});

describe('avatar upload', () => {
  it('is a keyboard-reachable button describing the limits', () => {
    renderWithQuery(<AvatarUpload profile={studentProfile()} />);
    const zone = screen.getByRole('button', { name: 'Add a photo' });
    expect(document.getElementById(zone.getAttribute('aria-describedby')!)?.textContent).toContain(
      'up to 5 MB',
    );
  });

  it('refuses a bad file without sending anything', () => {
    renderWithQuery(<AvatarUpload profile={studentProfile()} />);
    pick(fakeFile('a.gif', 'image/gif'));
    expect(screen.getByRole('alert').textContent).toBe('Choose a JPEG, PNG or WebP image.');
    expect(screen.queryByRole('button', { name: 'Upload photo' })).toBeNull();
    expect(patch).not.toHaveBeenCalled();
  });

  it('previews locally, uploads on confirm and confirms with a toast', async () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v2/a.jpg';
    patch.mockResolvedValue(ok(studentProfile({ avatar_url: url })));
    renderWithQuery(<AvatarUpload profile={studentProfile()} />);

    const file = fakeFile('me.jpg', 'image/jpeg');
    pick(file);
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:preview-1');
    expect(patch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [path, body] = patch.mock.calls[0]!;
    expect(path).toBe('/v1/users/me/avatar');
    expect((body as FormData).get('avatar')).toBe(file);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Profile photo updated.'));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
  });

  it('shows the upload state and locks the zone while uploading', async () => {
    patch.mockImplementation(pending);
    renderWithQuery(<AvatarUpload profile={studentProfile()} />);
    pick(fakeFile('me.jpg', 'image/jpeg'));
    fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

    const zone = await screen.findByRole('button', { name: /^Choose a different photo/ });
    expect(zone.getAttribute('aria-busy')).toBe('true');
    expect(zone.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Uploading…' }).hasAttribute('disabled')).toBe(true);
  });

  it.each([
    ['INVALID_FILE_TYPE', 400, "That file isn't a JPEG, PNG or WebP image. Choose another."],
    ['FILE_TOO_LARGE', 400, 'The image must be 5 MB or smaller.'],
    ['UPLOAD_UNAVAILABLE', 503, 'Photo uploads are switched off right now. Try again later.'],
    ['UPLOAD_FAILED', 502, "The upload didn't go through. Try again."],
  ])('explains %s from the server', async (code, status, message) => {
    patch.mockRejectedValue(axiosError(status, { success: false, error: { code, message: 'x' } }));
    renderWithQuery(<AvatarUpload profile={studentProfile()} />);
    pick(fakeFile('me.jpg', 'image/jpeg'));
    fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('cancel drops the preview and frees it', () => {
    renderWithQuery(<AvatarUpload profile={studentProfile()} />);
    pick(fakeFile('me.jpg', 'image/jpeg'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1');
    expect(screen.queryByRole('button', { name: 'Upload photo' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeTruthy();
  });

  it('accepts a dropped file', () => {
    renderWithQuery(<AvatarUpload profile={studentProfile()} />);
    const file = fakeFile('drop.png', 'image/png');
    fireEvent.drop(screen.getByRole('button', { name: 'Add a photo' }), {
      dataTransfer: { files: [file] },
    });
    expect(createObjectURL).toHaveBeenCalledWith(file);
  });
});

describe('change password form', () => {
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  function fillValid() {
    fill('Current password', 'Str0ng!pass');
    fill('New password', 'N3w!passw0rd');
    fill('Confirm new password', 'N3w!passw0rd');
  }

  it('validates the policy, the match and a reused password before calling the server', async () => {
    renderWithQuery(<PasswordForm />);
    fill('Current password', 'Str0ng!pass');
    fill('New password', 'short');
    fill('Confirm new password', 'other');
    submit();

    expect(
      await screen.findByText(
        'Use at least 8 characters, and add an uppercase letter, a number and a symbol.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
    expect(authClient.changePassword).not.toHaveBeenCalled();
  });

  it('refuses the same password as the current one', async () => {
    renderWithQuery(<PasswordForm />);
    fill('Current password', 'Str0ng!pass');
    fill('New password', 'Str0ng!pass');
    fill('Confirm new password', 'Str0ng!pass');
    submit();
    expect(
      await screen.findByText('Choose a password different from the current one.'),
    ).toBeTruthy();
  });

  it('changes the password, resets the form and says other devices were signed out', async () => {
    renderWithQuery(<PasswordForm />);
    fillValid();
    submit();

    await waitFor(() =>
      expect(authClient.changePassword).toHaveBeenCalledWith({
        currentPassword: 'Str0ng!pass',
        newPassword: 'N3w!passw0rd',
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Password changed.', {
        description: 'Other devices were signed out. This one stays signed in.',
      }),
    );
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
  });

  it('flags a wrong current password on its field', async () => {
    authClient.changePassword.mockResolvedValue({
      data: null,
      error: { status: 400, code: 'INVALID_PASSWORD', message: 'Invalid password' },
    });
    renderWithQuery(<PasswordForm />);
    fillValid();
    submit();

    expect(await screen.findByText("That isn't your current password.")).toBeTruthy();
    expect(screen.getByLabelText('Current password').getAttribute('aria-invalid')).toBe('true');
  });

  it('explains a weak password the server rejected', async () => {
    authClient.changePassword.mockResolvedValue({
      data: null,
      error: {
        status: 400,
        code: 'PASSWORD_TOO_WEAK',
        message: 'Password does not meet requirements.',
      },
    });
    renderWithQuery(<PasswordForm />);
    fillValid();
    submit();
    expect(await screen.findByText('Choose a different password.')).toBeTruthy();
  });

  it('says to wait after too many attempts', async () => {
    authClient.changePassword.mockResolvedValue({
      data: null,
      error: { status: 429, message: 'Too many requests' },
    });
    renderWithQuery(<PasswordForm />);
    fillValid();
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('Wait a minute');
  });
});
