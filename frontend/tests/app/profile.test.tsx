import { fireEvent, screen, waitFor } from '@testing-library/react';
import { profileChecklist } from '@/app/(app)/dashboard/_components/overview-view';
import { AcademicForm } from '@/app/(app)/dashboard/profile/_components/academic-form';
import { PersonalForm } from '@/app/(app)/dashboard/profile/_components/personal-form';
import { ProfileView } from '@/app/(app)/dashboard/profile/_components/profile-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, fill, pending, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, studentProfile, superAdminProfile } from './utils';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/dashboard/profile',
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');
const patch = jest.spyOn(api, 'patch');

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset();
  patch.mockReset();
  jest.mocked(toast.success).mockReset();
});

const save = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('profile page by user type', () => {
  it('shows a student the academic card', async () => {
    get.mockResolvedValue(ok(studentProfile()));
    renderWithQuery(
      <Workspace>
        <ProfileView />
      </Workspace>,
    );
    expect(await screen.findByRole('heading', { name: 'Academic details' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Personal details' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Password' })).toBeTruthy();
    expect((screen.getByLabelText('Student ID') as HTMLInputElement).value).toBe('CSE-2022/014');
  });

  it.each([
    ['faculty', facultyProfile()],
    ['super admin', superAdminProfile()],
  ])('gives %s no academic fields', async (_label, profile) => {
    get.mockResolvedValue(ok(profile));
    renderWithQuery(
      <Workspace>
        <ProfileView />
      </Workspace>,
    );
    expect(await screen.findByRole('heading', { name: 'Personal details' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Academic details' })).toBeNull();
    expect(screen.queryByLabelText('Student ID')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Password' })).toBeTruthy();
  });
});

describe('personal details form', () => {
  it('keeps Save disabled until something changes', () => {
    renderWithQuery(<PersonalForm profile={studentProfile()} />);
    const button = screen.getByRole('button', { name: 'Save details' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fill('Full name', 'Ayesha R.');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('sends only the changed fields and confirms with a toast', async () => {
    patch.mockResolvedValue(ok(studentProfile({ phone: '+8801712345678' })));
    renderWithQuery(<PersonalForm profile={studentProfile()} />);

    fill(/^Phone/, '+8801712345678');
    save('Save details');

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/users/me', { phone: '+8801712345678' }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Personal details saved.'));
  });

  it('sends null to remove the phone', async () => {
    patch.mockResolvedValue(ok(studentProfile({ phone: null })));
    renderWithQuery(<PersonalForm profile={studentProfile({ phone: '01712345678' })} />);

    fill(/^Phone/, '');
    save('Save details');

    await waitFor(() => expect(patch).toHaveBeenCalledWith('/v1/users/me', { phone: null }));
  });

  it('validates before calling the API', async () => {
    renderWithQuery(<PersonalForm profile={studentProfile()} />);
    fill('Full name', 'A');
    fill(/^Phone/, '12ab');
    save('Save details');

    expect(await screen.findByText('Enter your full name, 2 to 100 characters.')).toBeTruthy();
    expect(screen.getByLabelText(/^Phone/).getAttribute('aria-invalid')).toBe('true');
    expect(patch).not.toHaveBeenCalled();
  });

  it('puts server issues on their fields', async () => {
    patch.mockRejectedValue(
      axiosError(400, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed.',
          details: [{ path: 'phone', message: 'Phone must be 10 to 15 digits.' }],
        },
      }),
    );
    renderWithQuery(<PersonalForm profile={studentProfile()} />);
    fill(/^Phone/, '01712345678');
    save('Save details');

    expect(await screen.findByText('Phone must be 10 to 15 digits.')).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows a form-level alert when the server fails', async () => {
    patch.mockRejectedValue(axiosError(500, { success: false, error: { code: 'INTERNAL_ERROR' } }));
    renderWithQuery(<PersonalForm profile={studentProfile()} />);
    fill('Full name', 'Ayesha R.');
    save('Save details');

    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't save right now");
  });

  it('shows Saving… while the request runs', async () => {
    patch.mockImplementation(pending);
    renderWithQuery(<PersonalForm profile={studentProfile()} />);
    fill('Full name', 'Ayesha R.');
    save('Save details');
    const button = await screen.findByRole('button', { name: 'Saving…' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('discards edits back to the saved values', () => {
    renderWithQuery(<PersonalForm profile={studentProfile()} />);
    fill('Full name', 'Someone Else');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe('Ayesha Rahman');
  });
});

describe('academic details form', () => {
  it('sends the changed academic fields as numbers', async () => {
    patch.mockResolvedValue(ok(studentProfile({ current_year: 4, current_semester: 2 })));
    renderWithQuery(<AcademicForm profile={studentProfile()} />);

    fireEvent.change(screen.getByLabelText('Current year'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Current semester'), { target: { value: '2' } });
    save('Save academic details');

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/users/me', { current_year: 4, current_semester: 2 }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Academic details saved.'));
  });

  it('puts a taken student ID (409) on the Student ID field', async () => {
    patch.mockRejectedValue(
      axiosError(409, {
        success: false,
        error: { code: 'STUDENT_ID_TAKEN', message: 'Student ID already registered.' },
      }),
    );
    renderWithQuery(<AcademicForm profile={studentProfile()} />);
    fill('Student ID', 'CSE-2022/099');
    save('Save academic details');

    expect(await screen.findByText('Student ID already registered.')).toBeTruthy();
    expect(screen.getByLabelText('Student ID').getAttribute('aria-invalid')).toBe('true');
  });

  it('rejects a session whose years do not follow', async () => {
    renderWithQuery(<AcademicForm profile={studentProfile()} />);
    fill('Academic session', '2022-2025');
    save('Save academic details');
    expect(
      await screen.findByText('Enter your session as two years, like 2024-2025.'),
    ).toBeTruthy();
    expect(patch).not.toHaveBeenCalled();
  });
});

describe('profile checklist on the overview', () => {
  it('lists academic details only for students', () => {
    expect(profileChecklist(studentProfile()).map((i) => i.id)).toEqual([
      'avatar',
      'phone',
      'blood',
      'academic',
    ]);
    expect(profileChecklist(facultyProfile()).map((i) => i.id)).toEqual([
      'avatar',
      'phone',
      'blood',
    ]);
  });

  it('marks what is filled in', () => {
    const items = profileChecklist(studentProfile({ phone: '01712345678' }));
    expect(Object.fromEntries(items.map((i) => [i.id, i.done]))).toEqual({
      avatar: false,
      phone: true,
      blood: true,
      academic: true,
    });
    expect(profileChecklist(superAdminProfile()).find((i) => i.id === 'blood')?.done).toBe(false);
  });
});
