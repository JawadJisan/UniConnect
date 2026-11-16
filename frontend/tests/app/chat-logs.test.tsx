import { act, fireEvent, screen, within } from '@testing-library/react';
import { FROM_AFTER_TO, type ChatLogEntry, type UserProfile } from '@uniconnect/shared';
import { ChatLogsView } from '@/app/(app)/dashboard/admin/chatbot-logs/_components/chat-logs-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, superAdminProfile } from './utils';

// /dashboard/admin/chatbot-logs (FR-AI-002; D44, D45).

let search = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/admin/chatbot-logs',
  useSearchParams: () => search,
  useParams: () => ({}),
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');

const USER_ID = '0b6c2f3e-8a3d-4c55-9a51-1f2e3d4c5b6a';
const LONG_ANSWER = `The CSE Fair is on 2 December in Hall A.\n${'More detail. '.repeat(40)}`;

function entry(overrides: Partial<ChatLogEntry> = {}): ChatLogEntry {
  return {
    id: 501,
    question: 'What events are coming up?',
    answer: LONG_ANSWER,
    created_at: '2026-11-14T06:30:00.000Z',
    user: { id: USER_ID, name: 'Ayesha Rahman', role: 'student' },
    ...overrides,
  };
}

function serve(me: UserProfile, rows: ChatLogEntry[] | Error = [entry()]) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/admin/chatbot/logs') {
      if (rows instanceof Error) throw rows;
      return {
        data: {
          success: true,
          data: rows,
          meta: { page: 1, limit: 20, total: rows.length, total_pages: 1 },
        },
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

const renderPage = () =>
  renderWithQuery(
    <Workspace>
      <ChatLogsView />
    </Workspace>,
  );

const lastQuery = () => {
  const url = String(replace.mock.calls.at(-1)?.[0] ?? '');
  return new URLSearchParams(url.split('?')[1] ?? '');
};

const logCalls = () =>
  get.mock.calls.filter(([url]) => url === '/v1/admin/chatbot/logs').map(([, config]) => config);

const table = () => screen.findByRole('table', { name: 'Chatbot questions, newest first' });

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset();
  replace.mockReset();
  search = new URLSearchParams();
});

describe('chatbot log viewer', () => {
  it('turns away anyone but the super admin, without asking the API', async () => {
    serve(facultyProfile({ role: 'dept_admin' }));
    renderPage();
    expect(await screen.findByText("You don't have access to this page.")).toBeTruthy();
    expect(logCalls()).toHaveLength(0);
  });

  it('lists time, name and role, question and answer, and no email', async () => {
    serve(superAdminProfile(), [
      entry(),
      entry({ id: 500, user: { id: 'u2', name: 'Dr. Karim Hossain', role: 'dept_admin' } }),
    ]);
    renderPage();

    const rows = within(await table())
      .getAllByRole('row')
      .slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('14 Nov 2026, 12:30 pm')).toBeTruthy();
    expect(within(rows[0]!).getByText('Ayesha Rahman')).toBeTruthy();
    expect(within(rows[0]!).getByText('Student')).toBeTruthy();
    expect(within(rows[0]!).getByText('What events are coming up?')).toBeTruthy();
    expect(within(rows[1]!).getByText('Department admin')).toBeTruthy();
    expect((await table()).textContent).not.toMatch(/@/);
    expect(screen.getByText('SYS.AI.LOGS')).toBeTruthy();
  });

  it('sends the URL filters to the API and shows the user chip', async () => {
    search = new URLSearchParams({
      user_id: USER_ID,
      user: 'Ayesha Rahman',
      search: 'fees',
      from: '2026-11-01',
      to: '2026-11-14',
      page: '2',
    });
    serve(superAdminProfile());
    renderPage();

    await table();
    expect(logCalls().at(-1)).toEqual({
      params: {
        user_id: USER_ID,
        search: 'fees',
        from: '2026-11-01',
        to: '2026-11-14',
        page: 2,
      },
    });
    expect(screen.getByText('User:')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the user filter' }));
    expect(lastQuery().get('user_id')).toBeNull();
    expect(lastQuery().get('user')).toBeNull();
    expect(lastQuery().get('search')).toBe('fees');
  });

  it('pushes the search to the URL after a pause, resetting the page', async () => {
    search = new URLSearchParams({ page: '3' });
    serve(superAdminProfile());
    renderPage();
    await table();

    jest.useFakeTimers();
    try {
      fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'membership' } });
      expect(replace).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(400));
      expect(lastQuery().get('search')).toBe('membership');
      expect(lastQuery().get('page')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses a backwards date range on the page without a request', async () => {
    search = new URLSearchParams({ from: '2026-11-14', to: '2026-11-01' });
    serve(superAdminProfile());
    renderPage();

    expect(await screen.findByText(FROM_AFTER_TO)).toBeTruthy();
    expect(screen.getByLabelText('From').getAttribute('aria-invalid')).toBe('true');
    expect(logCalls()).toHaveLength(0);
  });

  it('filters to one person when their name is clicked', async () => {
    serve(superAdminProfile());
    renderPage();
    await table();

    fireEvent.click(
      screen.getByRole('button', { name: /Ayesha Rahman.*show only their questions/ }),
    );
    expect(lastQuery().get('user_id')).toBe(USER_ID);
    expect(lastQuery().get('user')).toBe('Ayesha Rahman');
  });

  it('opens the full question and answer in a dialog', async () => {
    serve(superAdminProfile());
    renderPage();
    await table();

    fireEvent.click(screen.getByRole('button', { name: 'View question 501' }));
    const dialog = await screen.findByRole('dialog', { name: 'Question #501' });
    expect(within(dialog).getByText('SYS.AI.LOG')).toBeTruthy();
    expect(within(dialog).getByText(/More detail\. More detail\./)).toBeTruthy();
    expect(within(dialog).getByText(/email addresses and phone numbers removed/)).toBeTruthy();
    expect(within(dialog).getByText('Student')).toBeTruthy();
  });

  it('shows the empty states, with Clear filters only when filtered', async () => {
    serve(superAdminProfile(), []);
    const { unmount } = renderPage();
    expect(await screen.findByText('No questions asked yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    unmount();

    search = new URLSearchParams({ search: 'nothing' });
    renderPage();
    expect(await screen.findByText('No questions match these filters')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThan(0);
  });

  it('offers a retry when the list fails to load, and none on a 403', async () => {
    // A 4xx isn't retried by the hook, so the error shows at once (a 5xx retries once).
    serve(superAdminProfile(), axiosError(404, { error: { code: 'NOT_FOUND', message: 'x' } }));
    const { unmount } = renderPage();
    expect(await screen.findByText("Couldn't load the chatbot logs.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    unmount();

    serve(superAdminProfile(), axiosError(403, { error: { code: 'FORBIDDEN', message: 'x' } }));
    renderPage();
    expect(await screen.findByText("You don't have access to the chatbot logs.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
