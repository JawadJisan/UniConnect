import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, type AxiosResponse } from 'axios';
import type { PersonalDashboard, UserProfile } from '@uniconnect/shared';
import { OverviewView } from '@/app/(app)/dashboard/_components/overview-view';
import { Workspace } from '@/app/(app)/_components/workspace';
import { api } from '@/lib/api';
import { resetAuthClient, setSession } from '../mocks/auth-client';
import { axiosError, pending, renderWithQuery } from '../auth/utils';
import { ok, studentProfile, superAdminProfile } from './utils';

// The assistant on the overview (FR-AI-001; D44, D45).

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
jest.mock('@/components/ui/sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
  Toaster: () => null,
}));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

const get = jest.spyOn(api, 'get');
const post = jest.spyOn(api, 'post');

function personal(enabled = true): PersonalDashboard {
  return {
    upcoming_events: [],
    membership: null,
    announcements: [],
    blood_requests: [],
    chatbot: { enabled },
  };
}

function serve(me: UserProfile, view: PersonalDashboard = personal()) {
  get.mockImplementation(async (url: string) => {
    if (url === '/v1/users/me') return ok(me);
    if (url === '/v1/dashboard/student') return ok(view);
    // The super admin's own section isn't under test here.
    if (url === '/v1/dashboard/super-admin') throw axiosError(500, {});
    throw new Error(`unexpected GET ${url}`);
  });
}

const apiError = (status: number, code: string, headers: Record<string, string> = {}) =>
  new AxiosError('Request failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    data: { success: false, error: { code, message: 'x' } },
    headers,
    config: { headers: {} },
  } as unknown as AxiosResponse);

const answer = (text: string, sources = [{ type: 'event' as const, id: 11 }]) =>
  ok({ answer: text, sources });

const renderPage = () =>
  renderWithQuery(
    <Workspace>
      <OverviewView />
    </Workspace>,
  );

const region = () => screen.findByRole('region', { name: 'Ask UniConnect' });
const thread = () => screen.getByRole('log', { name: 'Conversation with the assistant' });
const box = () => screen.getByLabelText('Your question') as HTMLTextAreaElement;
const asks = () => post.mock.calls.filter(([url]) => url === '/v1/chatbot/ask');

beforeEach(() => {
  resetAuthClient();
  setSession({ session: { id: 's1' }, user: { id: 'u1', name: 'A', email: 'a@example.com' } });
  get.mockReset();
  post.mockReset();
});

describe('assistant panel', () => {
  it('sits after the personal view and sends a starter prompt', async () => {
    serve(studentProfile());
    post.mockResolvedValue(answer('The CSE Fair is on 2 December.'));
    renderPage();

    const panel = await region();
    const campus = await screen.findByRole('region', { name: 'Your campus' });
    expect(campus.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(panel).getByText('SYS.AI.CHAT')).toBeTruthy();

    fireEvent.click(within(panel).getByRole('button', { name: 'What events are coming up?' }));

    expect(await within(thread()).findByText('The CSE Fair is on 2 December.')).toBeTruthy();
    expect(post).toHaveBeenCalledWith('/v1/chatbot/ask', {
      question: 'What events are coming up?',
    });
    const texts = within(thread())
      .getAllByText(/./, { selector: 'p' })
      .map((p) => p.textContent);
    expect(texts).toEqual(['What events are coming up?', 'The CSE Fair is on 2 December.']);
    const source = within(thread()).getByRole('link', { name: 'EVENT #11' });
    expect(source.getAttribute('href')).toBe('/dashboard/events/11');
    // The chips go once the thread has started.
    expect(within(panel).queryByRole('button', { name: 'What events are coming up?' })).toBeNull();
  });

  it('counts characters, blocks an overlong question and sends on Enter but not Shift+Enter', async () => {
    serve(studentProfile());
    post.mockResolvedValue(answer('Fees are on the club page.', []));
    renderPage();
    await region();

    fireEvent.change(box(), { target: { value: 'x'.repeat(501) } });
    expect(screen.getByText('501 / 500')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Questions are at most 500 characters.')).toBeTruthy();
    expect(asks()).toHaveLength(0);

    fireEvent.change(box(), { target: { value: 'What are the fees?' } });
    expect(screen.getByText('18 / 500')).toBeTruthy();
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(asks()).toHaveLength(0);
    fireEvent.keyDown(box(), { key: 'Enter' });

    await waitFor(() => expect(asks()).toHaveLength(1));
    expect(await within(thread()).findByText('Fees are on the club page.')).toBeTruthy();
    expect(box().value).toBe('');
  });

  it('shows the typing indicator and disables Ask while waiting', async () => {
    serve(studentProfile());
    post.mockReturnValue(pending());
    renderPage();
    await region();

    fireEvent.change(box(), { target: { value: 'Any events?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText('Assistant is typing…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask' })).toHaveProperty('disabled', true);
  });

  it('locks the composer for the Retry-After seconds on a 429', async () => {
    serve(studentProfile());
    post.mockRejectedValueOnce(apiError(429, 'RATE_LIMITED', { 'retry-after': '1' }));
    post.mockResolvedValue(answer('Here you go.', []));
    renderPage();
    await region();

    fireEvent.change(box(), { target: { value: 'Any events?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(
      await screen.findByText(
        "You've reached the limit of 10 AI requests a minute. Try again in 1 s.",
      ),
    ).toBeTruthy();
    expect(box().disabled).toBe(true);
    expect(within(thread()).getByText('Not sent')).toBeTruthy();

    await waitFor(() => expect(box().disabled).toBe(false), { timeout: 3000 });
    expect(screen.queryByText(/reached the limit/)).toBeNull();
  });

  it('keeps going after an unavailable answer, and Retry sends the question again', async () => {
    serve(studentProfile());
    post.mockRejectedValueOnce(apiError(503, 'AI_UNAVAILABLE'));
    post.mockResolvedValue(answer('Second time lucky.', []));
    renderPage();
    await region();

    fireEvent.change(box(), { target: { value: 'Any events?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(
      await screen.findByText('The assistant is unavailable right now. Try again shortly.'),
    ).toBeTruthy();
    expect(box().disabled).toBe(false);

    fireEvent.click(within(thread()).getByRole('button', { name: 'Retry this question' }));
    expect(await within(thread()).findByText('Second time lucky.')).toBeTruthy();
    expect(asks()).toHaveLength(2);
    expect(asks()[1]![1]).toEqual({ question: 'Any events?' });
    expect(within(thread()).queryByText('Not sent')).toBeNull();
    expect(within(thread()).getAllByText('Any events?')).toHaveLength(1);
  });

  it('says the assistant is not set up when the personal view reports it off', async () => {
    serve(studentProfile(), personal(false));
    renderPage();

    const panel = await region();
    expect(
      await within(panel).findByText("The assistant isn't set up on this server."),
    ).toBeTruthy();
    expect(within(panel).queryByLabelText('Your question')).toBeNull();
  });

  it('shows the panel to a super admin, and switches off on AI_NOT_CONFIGURED', async () => {
    serve(superAdminProfile());
    post.mockRejectedValue(apiError(503, 'AI_NOT_CONFIGURED'));
    renderPage();

    const panel = await region();
    fireEvent.click(
      within(panel).getByRole('button', { name: 'What are the latest announcements?' }),
    );

    expect(
      await within(panel).findByText("The assistant isn't set up on this server."),
    ).toBeTruthy();
    expect(within(panel).queryByLabelText('Your question')).toBeNull();
  });
});
