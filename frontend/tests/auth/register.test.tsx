import { fireEvent, screen, waitFor } from '@testing-library/react';
import { RegisterView } from '@/app/(auth)/register/register-view';
import { api } from '@/lib/api';
import { resetAuthClient } from '../mocks/auth-client';
import { axiosError, fill, pending, renderWithQuery } from './utils';

const push = jest.fn();
let search = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return { ...actual, api: { get: jest.fn(), post: jest.fn() } };
});

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;

const DEPARTMENTS = [
  { id: 7, name: 'CSE', description: 'Computer Science and Engineering' },
  { id: 8, name: 'ECE', description: null },
];

beforeEach(() => {
  resetAuthClient();
  push.mockReset();
  post.mockReset();
  get.mockReset().mockResolvedValue({ data: { success: true, data: DEPARTMENTS } });
  search = '';
});

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

async function fillStudent() {
  await screen.findByRole('option', { name: 'CSE (Computer Science and Engineering)' });
  fill('Full name', 'Ayesha Rahman');
  fill('Email', 'Ayesha@Example.com');
  fill(/^Password/, 'Str0ng!pass');
  fill('Department', '7');
  fill('Student ID', 'CSE-2022/014');
  fill(/^Academic session/, '2022-2023');
  fill('Year', '3');
  fill('Semester', '1');
  fill(/^Blood group/, 'B+');
}

describe('register page', () => {
  it('shows the student form by default and the faculty form with ?as=faculty', () => {
    const { unmount } = renderWithQuery(<RegisterView />);
    expect(screen.getByRole('link', { name: 'Student' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByLabelText('Student ID')).toBeTruthy();
    unmount();

    search = 'as=faculty';
    renderWithQuery(<RegisterView />);
    expect(screen.getByRole('link', { name: 'Faculty' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByLabelText('Student ID')).toBeNull();
    expect(screen.queryByLabelText('Year')).toBeNull();
  });

  it('loads departments into the select, disabled while loading', async () => {
    get.mockImplementation(pending);
    const { unmount } = renderWithQuery(<RegisterView />);
    expect(screen.getByLabelText('Department').hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('option', { name: 'Loading departments…' })).toBeTruthy();
    unmount();

    get.mockResolvedValue({ data: { success: true, data: DEPARTMENTS } });
    renderWithQuery(<RegisterView />);
    expect(await screen.findByRole('option', { name: 'ECE' })).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/v1/departments');
  });

  it('says so when departments fail to load', async () => {
    get.mockRejectedValue(axiosError(500, { success: false, error: { code: 'INTERNAL_ERROR' } }));
    renderWithQuery(<RegisterView />);
    expect(
      await screen.findByText("Couldn't load departments. Reload the page to try again."),
    ).toBeTruthy();
  });

  it('validates every required field before calling the API', async () => {
    renderWithQuery(<RegisterView />);
    submit();

    expect(await screen.findByText('Enter a password.')).toBeTruthy();
    // Zod's generic wording ("Too small: expected string...") never reaches the person.
    expect(screen.getByText('Choose your department.')).toBeTruthy();
    expect(screen.getByText('Enter a valid email address, like name@example.com.')).toBeTruthy();
    expect(screen.queryByText(/expected/)).toBeNull();
    for (const label of ['Full name', 'Email', 'Department', 'Student ID', 'Year', 'Semester']) {
      expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
    }
    expect(post).not.toHaveBeenCalled();
  });

  it('sends exactly the schema fields, with numbers as numbers, then goes to verify-email', async () => {
    post.mockResolvedValue({ data: { success: true } });
    renderWithQuery(<RegisterView />);
    await fillStudent();
    submit();

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/verify-email?email=ayesha%40example.com'),
    );
    expect(post).toHaveBeenCalledWith('/v1/auth/register/student', {
      name: 'Ayesha Rahman',
      email: 'ayesha@example.com',
      password: 'Str0ng!pass',
      department_id: 7,
      student_id: 'CSE-2022/014',
      academic_session: '2022-2023',
      current_year: 3,
      current_semester: 1,
      blood_group: 'B+',
    });
  });

  it('disables the button while creating the account', async () => {
    post.mockImplementation(pending);
    renderWithQuery(<RegisterView />);
    await fillStudent();
    submit();

    const button = await screen.findByRole('button', { name: 'Creating account…' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('puts a taken email error on the email field', async () => {
    post.mockRejectedValue(
      axiosError(409, {
        success: false,
        error: { code: 'EMAIL_TAKEN', message: 'Email already registered.' },
      }),
    );
    renderWithQuery(<RegisterView />);
    await fillStudent();
    submit();

    expect(await screen.findByText('Email already registered.')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect(push).not.toHaveBeenCalled();
  });

  it('maps server validation details onto fields', async () => {
    post.mockRejectedValue(
      axiosError(400, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body.',
          details: [{ path: 'student_id', message: 'Student ID may contain letters.' }],
        },
      }),
    );
    renderWithQuery(<RegisterView />);
    await fillStudent();
    submit();

    expect(await screen.findByText('Student ID may contain letters.')).toBeTruthy();
    expect(screen.getByLabelText('Student ID').getAttribute('aria-invalid')).toBe('true');
  });

  it('explains the registration rate limit', async () => {
    post.mockRejectedValue(
      axiosError(429, { success: false, error: { code: 'RATE_LIMITED', message: 'x' } }),
    );
    renderWithQuery(<RegisterView />);
    await fillStudent();
    submit();

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Too many sign-up attempts from this network.',
    );
  });
});
