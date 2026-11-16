import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Workspace } from '@/app/(app)/_components/workspace';
import { api } from '@/lib/api';
import { authClient, resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, renderWithQuery } from '../auth/utils';
import { ok, studentProfile, superAdminProfile } from './utils';

const replace = jest.fn();
let pathname = '/dashboard/profile';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => pathname,
}));

const get = jest.spyOn(api, 'get');

// cmdk measures its list; jsdom has neither of these.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

const SESSION = {
  session: { id: 's1' },
  user: { id: 'u1', name: 'Ayesha Rahman', email: 'ayesha@example.com' },
};

beforeEach(() => {
  resetAuthClient();
  replace.mockReset();
  get.mockReset();
  pathname = '/dashboard/profile';
});

const page = <p>Page content</p>;

describe('workspace guard', () => {
  it('shows the shell outline while the session loads', () => {
    setSession(null, true);
    get.mockReturnValue(new Promise(() => {}));
    renderWithQuery(<Workspace>{page}</Workspace>);
    expect(screen.getByLabelText('Loading your account').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('Page content')).toBeNull();
  });

  it('sends a signed-out visitor to log in, coming back here afterwards', async () => {
    get.mockRejectedValue(axiosError(401, { success: false, error: { code: 'UNAUTHORIZED' } }));
    renderWithQuery(<Workspace>{page}</Workspace>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?next=%2Fdashboard%2Fprofile'));
    expect(screen.queryByText('Page content')).toBeNull();
  });

  it('sends a stale cookie (API 401) to log in', async () => {
    setSession(SESSION);
    get.mockRejectedValue(axiosError(401, { success: false, error: { code: 'UNAUTHORIZED' } }));
    renderWithQuery(<Workspace>{page}</Workspace>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringMatching(/^\/login/)));
  });

  it('stops a suspended account and offers sign out', async () => {
    setSession(SESSION);
    get.mockRejectedValue(
      axiosError(403, { success: false, error: { code: 'FORBIDDEN', message: 'suspended' } }),
    );
    renderWithQuery(<Workspace>{page}</Workspace>);

    expect(await screen.findByText('This account is suspended.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(authClient.signOut).toHaveBeenCalled());
    expect(screen.queryByText('Page content')).toBeNull();
  });

  it('shows an error with retry when the profile fails to load', async () => {
    setSession(SESSION);
    get.mockRejectedValueOnce(
      axiosError(500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    );
    renderWithQuery(<Workspace>{page}</Workspace>);

    // useMe retries a 5xx once before giving up.
    get.mockRejectedValueOnce(
      axiosError(500, { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
    );
    expect(
      await screen.findByText("Couldn't load your account.", undefined, { timeout: 4000 }),
    ).toBeTruthy();
    get.mockResolvedValue(ok(studentProfile()));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Page content')).toBeTruthy();
  });
});

describe('workspace shell', () => {
  beforeEach(() => setSession(SESSION));

  it('renders the role-aware sidebar, location and account tag', async () => {
    get.mockResolvedValue(ok(studentProfile()));
    renderWithQuery(<Workspace>{page}</Workspace>);

    expect(await screen.findByText('Page content')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Workspace' });
    expect(within(nav).getByRole('link', { name: 'Profile' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe(
      null,
    );
    expect(screen.getAllByText('Student · CSE').length).toBeGreaterThan(0);
    expect(screen.getByRole('main').textContent).toContain('Page content');
  });

  it('tags a super admin without a department', async () => {
    get.mockResolvedValue(ok(superAdminProfile()));
    renderWithQuery(<Workspace>{page}</Workspace>);
    expect((await screen.findAllByText('Super admin')).length).toBeGreaterThan(0);
  });

  it('signs out and leaves the workspace', async () => {
    get.mockResolvedValue(ok(studentProfile()));
    renderWithQuery(<Workspace>{page}</Workspace>);
    await screen.findByText('Page content');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(authClient.signOut).toHaveBeenCalled());
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('opens the navigation drawer and closes it with Escape', async () => {
    get.mockResolvedValue(ok(studentProfile()));
    renderWithQuery(<Workspace>{page}</Workspace>);
    await screen.findByText('Page content');

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const drawer = await screen.findByRole('dialog', { name: 'Navigation' });
    expect(within(drawer).getByRole('link', { name: 'Overview' })).toBeTruthy();

    fireEvent.keyDown(drawer, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull());
  });

  it('opens the page palette with Ctrl+K', async () => {
    get.mockResolvedValue(ok(studentProfile()));
    renderWithQuery(<Workspace>{page}</Workspace>);
    await screen.findByText('Page content');

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(await screen.findByRole('dialog', { name: 'Go to' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Profile' })).toBeTruthy();
  });
});
