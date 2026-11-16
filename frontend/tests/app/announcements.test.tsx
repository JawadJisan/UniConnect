import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Announcement, UserProfile } from '@uniconnect/shared';
import {
  AnnouncementsView,
  paramsFromUrl,
} from '@/app/(app)/dashboard/announcements/_components/announcements-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { toast } from '@/components/ui/sonner';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, renderWithQuery } from '../auth/utils';
import { facultyProfile, ok, studentProfile, superAdminProfile } from './utils';

let search = new URLSearchParams();
const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, refresh: jest.fn() }),
  usePathname: () => '/dashboard/announcements',
  useSearchParams: () => search,
  useParams: () => ({}),
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

const get = jest.spyOn(api, 'get');
const post = jest.spyOn(api, 'post');
const del = jest.spyOn(api, 'delete');
const patch = jest.spyOn(api, 'patch');

const CSE = { id: 1, name: 'CSE' };
const EEE = { id: 2, name: 'EEE' };
const CSE_CLUB = { id: 3, name: 'CSE Club', department: CSE };
const EEE_CLUB = { id: 4, name: 'EEE Club', department: EEE };
const moderatorProfile = () => studentProfile({ role: 'moderator' });
const deptAdminProfile = () => facultyProfile({ role: 'dept_admin' });

function post_(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 7,
    title: 'Exam week',
    content: 'The library opens at 7.',
    is_pinned: false,
    scope: 'department',
    club: null,
    department: CSE,
    author: { id: 'a1', name: 'Dr. Karim Hossain' },
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    can_manage: false,
    can_pin: false,
    ...overrides,
  };
}

const page = <T,>(data: T[]) => ({
  data: { success: true, data, meta: { page: 1, limit: 20, total: data.length, total_pages: 1 } },
});
const apiError = (status: number, code: string, message = 'x', details?: unknown) =>
  axiosError(status, { success: false, error: { code, message, details } });

function serve({
  me = studentProfile(),
  posts = [post_()] as unknown,
}: { me?: UserProfile; posts?: unknown } = {}) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/departments') return ok([CSE, EEE]);
    if (url === '/v1/clubs') return page([CSE_CLUB, EEE_CLUB]);
    if (url === '/v1/clubs/my-club') {
      if (me.role === 'super_admin') throw apiError(404, 'NO_DEPARTMENT_CLUB');
      return ok(CSE_CLUB);
    }
    if (url === '/v1/announcements') {
      if (posts instanceof Error) throw posts;
      return page(posts as Announcement[]);
    }
    throw new Error(`unexpected GET ${url}`);
  });
}

const renderPage = () => renderWithQuery(<Workspace>{<AnnouncementsView />}</Workspace>);
const card = (title: string) => screen.getByRole('article', { name: title });

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  for (const spy of [get, post, del, patch]) spy.mockReset();
  jest.mocked(toast.success).mockReset();
  jest.mocked(toast.error).mockReset();
  replace.mockReset();
  search = new URLSearchParams();
});

describe('announcement list params', () => {
  it('keeps ids, the pinned flag and the page, and drops anything else', () => {
    expect(
      paramsFromUrl(new URLSearchParams('club_id=3&is_pinned=true&page=2&evil=1&department_id=x')),
    ).toEqual({ club_id: 3, is_pinned: 'true', page: 2 });
    expect(paramsFromUrl(new URLSearchParams('is_pinned=false&page=1'))).toEqual({});
  });
});

describe('announcements feed', () => {
  it('shows each post with its scope, author and time, pinned ones marked', async () => {
    serve({
      posts: [
        post_({
          id: 8,
          title: 'Blood drive',
          is_pinned: true,
          scope: 'club',
          club: CSE_CLUB,
          department: null,
        }),
        post_(),
      ],
    });
    renderPage();
    const pinned = await screen.findByRole('article', { name: 'Blood drive' });
    expect(within(pinned).getByText('CLUB · CSE Club')).toBeTruthy();
    expect(within(pinned).getByText('Pinned')).toBeTruthy();
    expect(within(pinned).getByText('SYS.ANNOUNCE.PINNED')).toBeTruthy();
    const plain = card('Exam week');
    expect(within(plain).getByText('DEPARTMENT · CSE')).toBeTruthy();
    expect(within(plain).getByText('Dr. Karim Hossain')).toBeTruthy();
    expect(within(plain).getByText('2 hours ago')).toBeTruthy();
    expect(within(plain).queryByText('Pinned')).toBeNull();
    // The API's order is kept: pinned first.
    expect(
      screen
        .getAllByRole('article')
        .map((a) => within(a).getByRole('heading', { level: 2 }).textContent),
    ).toEqual(['Blood drive', 'Exam week']);
  });

  it('shows actions only from the API flags', async () => {
    serve({
      me: deptAdminProfile(),
      posts: [
        post_({ id: 1, title: 'Mine', can_manage: true, can_pin: true }),
        post_({ id: 2, title: 'Theirs' }),
      ],
    });
    renderPage();
    const mine = await screen.findByRole('article', { name: 'Mine' });
    expect(within(mine).getByRole('button', { name: 'Pin Mine' })).toBeTruthy();
    expect(within(mine).getByRole('button', { name: 'Edit Mine' })).toBeTruthy();
    expect(within(mine).getByRole('button', { name: 'Delete Mine' })).toBeTruthy();
    expect(within(card('Theirs')).queryByRole('button')).toBeNull();
  });

  it('offers New announcement to posters only', async () => {
    serve();
    renderPage();
    await screen.findByRole('article', { name: 'Exam week' });
    expect(screen.queryByRole('button', { name: 'New announcement' })).toBeNull();
  });

  it('toggles a pin and confirms it', async () => {
    serve({ me: deptAdminProfile(), posts: [post_({ can_pin: true, can_manage: true })] });
    patch.mockResolvedValue(ok(post_({ is_pinned: true, can_pin: true, can_manage: true })));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Pin Exam week' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/v1/announcements/7/pin'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Pinned.'));
  });

  it('deletes only after the confirmation', async () => {
    serve({ me: deptAdminProfile(), posts: [post_({ can_manage: true })] });
    del.mockResolvedValue({ data: { success: true, data: { id: 7 } } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Exam week' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this announcement?' });
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete announcement' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/v1/announcements/7'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Announcement deleted.'));
  });

  it('writes the scope filter and the pinned toggle to the URL, back on page 1', async () => {
    search = new URLSearchParams('page=2');
    serve();
    renderPage();
    await screen.findByRole('article', { name: 'Exam week' });
    await screen.findByRole('option', { name: 'My club' });
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'club' } });
    expect(replace).toHaveBeenCalledWith('/dashboard/announcements?club_id=3', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: 'Pinned only' }));
    expect(replace).toHaveBeenLastCalledWith('/dashboard/announcements?is_pinned=true', {
      scroll: false,
    });
  });

  it('gives a super admin department and club filters', async () => {
    serve({ me: superAdminProfile() });
    renderPage();
    await screen.findByRole('article', { name: 'Exam week' });
    expect(screen.getByLabelText('Department')).toBeTruthy();
    expect(screen.getByLabelText('Club')).toBeTruthy();
    expect(screen.queryByLabelText('Show')).toBeNull();
  });

  it('says when filters hide everything and offers to clear them', async () => {
    search = new URLSearchParams('is_pinned=true');
    serve({ posts: [] });
    renderPage();
    expect(await screen.findByText('No announcements match these filters')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(replace).toHaveBeenCalledWith('/dashboard/announcements');
  });

  it('has an empty state without filters', async () => {
    serve({ posts: [] });
    renderPage();
    expect(await screen.findByText('No announcements yet')).toBeTruthy();
  });

  it('shows a loading state, then an error with retry', async () => {
    serve({ posts: apiError(500, 'INTERNAL') });
    renderPage();
    expect(await screen.findByText('Loading announcements…')).toBeTruthy();
    // The hook retries a 500 once before giving up.
    expect(
      await screen.findByRole('button', { name: /Try again/ }, { timeout: 4000 }),
    ).toBeTruthy();
    expect(screen.getByText("Couldn't load announcements.")).toBeTruthy();
  });

  it('clamps a long post behind Show more', async () => {
    serve({ posts: [post_({ content: 'line\n'.repeat(10) })] });
    renderPage();
    const more = await screen.findByRole('button', { name: 'Show more' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  });
});

describe('announcement dialog', () => {
  async function openCreate(me: UserProfile) {
    serve({ me, posts: [] });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'New announcement' }));
    return screen.findByRole('dialog', { name: 'New announcement' });
  }

  it('locks a moderator to their club and hides the pin option', async () => {
    const dialog = await openCreate(moderatorProfile());
    expect(await within(dialog).findByText('CSE Club')).toBeTruthy();
    expect(within(dialog).queryByRole('radio')).toBeNull();
    expect(within(dialog).queryByLabelText('Pin to the top')).toBeNull();

    post.mockResolvedValue(ok(post_()));
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Meet-up' } });
    fireEvent.change(within(dialog).getByLabelText('Announcement'), {
      target: { value: 'Friday at 4.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post announcement' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/announcements', {
        title: 'Meet-up',
        content: 'Friday at 4.',
        club_id: 3,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Announcement posted.');
  });

  it('lets a dept admin choose department or club, and pin', async () => {
    const dialog = await openCreate(deptAdminProfile());
    const deptRadio = await within(dialog).findByRole('radio', { name: /Department · CSE/ });
    expect((deptRadio as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole('radio', { name: /Club · CSE Club/ }));
    fireEvent.click(within(dialog).getByLabelText('Pin to the top'));
    post.mockResolvedValue(ok(post_()));
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Fees' } });
    fireEvent.change(within(dialog).getByLabelText('Announcement'), { target: { value: 'Due.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post announcement' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/announcements', {
        title: 'Fees',
        content: 'Due.',
        club_id: 3,
        is_pinned: true,
      }),
    );
  });

  it('makes a super admin pick a department from the list', async () => {
    const dialog = await openCreate(superAdminProfile());
    fireEvent.change(await within(dialog).findByLabelText('Title'), { target: { value: 'Hi' } });
    fireEvent.change(within(dialog).getByLabelText('Announcement'), { target: { value: 'All.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post announcement' }));
    expect(await within(dialog).findByText('Choose a department.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    post.mockResolvedValue(ok(post_()));
    fireEvent.change(within(dialog).getByLabelText('Department'), { target: { value: '2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post announcement' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/v1/announcements', {
        title: 'Hi',
        content: 'All.',
        department_id: 2,
      }),
    );
  });

  it('requires a title and text', async () => {
    const dialog = await openCreate(moderatorProfile());
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Post announcement' }));
    expect(await within(dialog).findByText('Title is required.')).toBeTruthy();
    expect(within(dialog).getByText('Write the announcement.')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows a refusal from the API in the form', async () => {
    const dialog = await openCreate(moderatorProfile());
    post.mockRejectedValue(
      apiError(
        403,
        'ANNOUNCEMENT_SCOPE_FORBIDDEN',
        'You can post only to a club where you hold a committee position.',
      ),
    );
    fireEvent.change(await within(dialog).findByLabelText('Title'), { target: { value: 'x' } });
    fireEvent.change(within(dialog).getByLabelText('Announcement'), { target: { value: 'y' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post announcement' }));
    expect(
      await within(dialog).findByText(
        'You can post only to a club where you hold a committee position.',
      ),
    ).toBeTruthy();
  });

  it('edits title and content only, with the audience locked', async () => {
    serve({ me: deptAdminProfile(), posts: [post_({ can_manage: true })] });
    patch.mockResolvedValue(ok(post_({ title: 'Exam week moved', can_manage: true })));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Exam week' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit announcement' });
    expect(within(dialog).queryByRole('radio')).toBeNull();
    expect(within(dialog).getByText('DEPARTMENT · CSE')).toBeTruthy();
    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: 'Exam week moved' },
    });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(save);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/v1/announcements/7', { title: 'Exam week moved' }),
    );
    expect(toast.success).toHaveBeenCalledWith('Announcement updated.');
  });

  it('maps a 400 detail onto its field', async () => {
    serve({ me: deptAdminProfile(), posts: [post_({ can_manage: true })] });
    patch.mockRejectedValue(
      apiError(400, 'VALIDATION_ERROR', 'Invalid request body.', [
        { path: 'title', message: 'Title must be at most 200 characters.' },
      ]),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Exam week' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit announcement' });
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Changed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await within(dialog).findByText('Title must be at most 200 characters.')).toBeTruthy();
  });
});
