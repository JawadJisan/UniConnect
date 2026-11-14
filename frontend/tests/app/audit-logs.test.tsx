import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AuditLogEntry, UserProfile } from '@uniconnect/shared';
import { AuditLogsView } from '@/app/(app)/dashboard/admin/audit-logs/_components/audit-logs-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, superAdminProfile } from './utils';

// /dashboard/admin/audit-logs (FR-AUDIT-002; D42, D43).

let search = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/admin/audit-logs',
  useSearchParams: () => search,
  useParams: () => ({}),
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');

const ACTOR_ID = '0b6c2f3e-8a3d-4c55-9a51-1f2e3d4c5b6a';

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 77,
    action: 'ROLE_CHANGED',
    entity_type: 'User',
    entity_id: 'u9',
    old_value: { role: 'student', department_id: 1 },
    new_value: { role: 'moderator', department_id: 1, note: 'committee' },
    ip_address: '203.0.113.9',
    created_at: '2026-11-14T06:30:00.000Z',
    actor: { id: ACTOR_ID, name: 'Dr. Karim Hossain', role: 'dept_admin' },
    ...overrides,
  };
}

function serve(me: UserProfile, rows: AuditLogEntry[] | Error = [entry()]) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/admin/audit-logs') {
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
      <AuditLogsView />
    </Workspace>,
  );

/** The query string of the last router.replace call. */
const lastQuery = () => {
  const url = String(replace.mock.calls.at(-1)?.[0] ?? '');
  return new URLSearchParams(url.split('?')[1] ?? '');
};

const auditCalls = () =>
  get.mock.calls.filter(([url]) => url === '/v1/admin/audit-logs').map(([, config]) => config);

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset();
  replace.mockReset();
  search = new URLSearchParams();
});

describe('audit log viewer', () => {
  it('lists entries with time, actor and role, action, entity and IP, and no email', async () => {
    serve(superAdminProfile(), [entry(), entry({ id: 76, actor: null, ip_address: null })]);
    renderPage();

    const table = await screen.findByRole('table', { name: 'Audit log entries, newest first' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Dr. Karim Hossain')).toBeTruthy();
    expect(within(rows[0]!).getByText('Department admin')).toBeTruthy();
    expect(within(rows[0]!).getByText('ROLE_CHANGED')).toBeTruthy();
    expect(within(rows[0]!).getByText('User #u9')).toBeTruthy();
    expect(within(rows[0]!).getByText('203.0.113.9')).toBeTruthy();
    expect(within(rows[0]!).getByText('14 Nov 2026, 12:30 pm')).toBeTruthy();
    expect(within(rows[1]!).getByText('System')).toBeTruthy();
    expect(table.textContent).not.toMatch(/@/);
  });

  it('sends the URL filters to the API', async () => {
    search = new URLSearchParams({
      action: 'ROLE_CHANGED',
      entity_type: 'User',
      from: '2026-11-01',
      to: '2026-11-14',
      user_id: ACTOR_ID,
      actor: 'Dr. Karim Hossain',
      page: '2',
    });
    serve(superAdminProfile());
    renderPage();

    await screen.findByRole('table', { name: 'Audit log entries, newest first' });
    expect(auditCalls().at(-1)).toEqual({
      params: {
        action: 'ROLE_CHANGED',
        entity_type: 'User',
        from: '2026-11-01',
        to: '2026-11-14',
        user_id: ACTOR_ID,
        page: 2,
      },
    });
    expect(screen.getByText('Actor:')).toBeTruthy();
  });

  it('writes the action, dates and actor to the URL, resetting the page', async () => {
    search = new URLSearchParams({ page: '3' });
    serve(superAdminProfile());
    renderPage();
    await screen.findByRole('table', { name: 'Audit log entries, newest first' });

    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'LOGIN' } });
    expect(lastQuery().get('action')).toBe('LOGIN');
    expect(lastQuery().get('page')).toBeNull();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-02' } });
    expect(lastQuery().get('from')).toBe('2026-11-02');
    // The URL here never catches up (as in a quick second edit); the end date still carries
    // the start date with it.
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-09' } });
    expect(lastQuery().get('from')).toBe('2026-11-02');
    expect(lastQuery().get('to')).toBe('2026-11-09');

    fireEvent.click(
      screen.getByRole('button', { name: /Dr\. Karim Hossain.*show only their entries/ }),
    );
    expect(lastQuery().get('user_id')).toBe(ACTOR_ID);
    expect(lastQuery().get('actor')).toBe('Dr. Karim Hossain');
  });

  it('waits for typing to pause before filtering by entity type', async () => {
    serve(superAdminProfile());
    renderPage();
    await screen.findByRole('table', { name: 'Audit log entries, newest first' });

    jest.useFakeTimers();
    try {
      fireEvent.change(screen.getByLabelText('Entity type'), { target: { value: 'Even' } });
      fireEvent.change(screen.getByLabelText('Entity type'), { target: { value: 'Event' } });
      expect(replace).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(400));
      expect(replace).toHaveBeenCalledTimes(1);
      expect(lastQuery().get('entity_type')).toBe('Event');
    } finally {
      jest.useRealTimers();
    }
  });

  it('refuses a start date after the end date without asking the API', async () => {
    search = new URLSearchParams({ from: '2026-11-15', to: '2026-11-14' });
    serve(superAdminProfile());
    renderPage();

    expect(
      await screen.findByText('The start date must be on or before the end date.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('From').getAttribute('aria-invalid')).toBe('true');
    expect(auditCalls()).toHaveLength(0);
  });

  it('shows the server message for a filter the API refuses', async () => {
    search = new URLSearchParams({ action: 'LOGIN' });
    serve(
      superAdminProfile(),
      axiosError(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query.',
          details: [{ path: 'action', message: 'Not a known audit action.' }],
        },
      }),
    );
    renderPage();

    expect(await screen.findByText("These filters can't be used.")).toBeTruthy();
    expect(screen.getByText('Not a known audit action.')).toBeTruthy();
  });

  it('says when nothing matches, and clears the filters', async () => {
    search = new URLSearchParams({ action: 'LOGIN' });
    serve(superAdminProfile(), []);
    renderPage();

    expect(await screen.findByText('No entries match these filters')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1)!);
    expect(replace).toHaveBeenLastCalledWith('/dashboard/admin/audit-logs', { scroll: false });
  });

  it('shows an error with a retry', async () => {
    serve(superAdminProfile(), axiosError(404, { error: { code: 'NOT_FOUND', message: 'x' } }));
    renderPage();
    expect(await screen.findByText("Couldn't load the audit log.")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('opens the diff of one entry: changes in words, then the raw values', async () => {
    serve(superAdminProfile());
    renderPage();
    await screen.findByRole('table', { name: 'Audit log entries, newest first' });

    fireEvent.click(screen.getByRole('button', { name: 'Inspect entry 77' }));
    const dialog = await screen.findByRole('dialog', { name: 'Role changed' });
    const changes = within(dialog).getByRole('list');
    const items = within(changes)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toEqual(['Addednotecommittee', 'Changedrolestudent →  to moderator']);
    expect(within(dialog).getByText('1 unchanged field not listed.')).toBeTruthy();
    expect(within(dialog).getByText('Before')).toBeTruthy();
    expect(within(dialog).getByText(/"role": "moderator"/)).toBeTruthy();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('turns away anyone but the super admin', async () => {
    serve(facultyProfile({ role: 'dept_admin' }));
    renderPage();
    expect(await screen.findByText("You don't have access to this page.")).toBeTruthy();
    expect(auditCalls()).toHaveLength(0);
  });
});
