import { AxiosError, type AxiosResponse } from 'axios';
import { ApiError } from '@/lib/api';
import {
  aiErrorMessage,
  chatLogParamsFromUrl,
  sourceHref,
  sourceLabel,
  toAiError,
} from '@/lib/chatbot';

// FR-AI-001–003 helpers (D44, D45).

function rateLimited(retryAfter?: string) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 429,
    statusText: '',
    data: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
    headers: retryAfter ? { 'retry-after': retryAfter } : {},
    config: { headers: {} },
  } as unknown as AxiosResponse);
}

describe('toAiError', () => {
  it("keeps a 429's Retry-After seconds", () => {
    const err = toAiError(rateLimited('42'));
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryAfter).toBe(42);
  });

  it('leaves retryAfter unset without a usable header', () => {
    expect(toAiError(rateLimited()).retryAfter).toBeUndefined();
    expect(toAiError(rateLimited('soon')).retryAfter).toBeUndefined();
  });
});

describe('aiErrorMessage', () => {
  it('names the shared limit and the seconds left on a 429', () => {
    const err = Object.assign(new ApiError(429, 'RATE_LIMITED', 'x'), { retryAfter: 30 });
    expect(aiErrorMessage(err)).toBe(
      "You've reached the limit of 10 AI requests a minute. Try again in 30 s.",
    );
    expect(aiErrorMessage(err, 4)).toMatch(/Try again in 4 s\.$/);
    expect(aiErrorMessage(new ApiError(429, 'RATE_LIMITED', 'x'))).toMatch(/Try again shortly\.$/);
  });

  it('tells an unconfigured server from an unavailable one', () => {
    expect(aiErrorMessage(new ApiError(503, 'AI_NOT_CONFIGURED', 'x'))).toBe(
      "The assistant isn't set up on this server.",
    );
    expect(aiErrorMessage(new ApiError(503, 'AI_UNAVAILABLE', 'x'))).toBe(
      'The assistant is unavailable right now. Try again shortly.',
    );
  });

  it('uses the field message for a 400, and the message otherwise', () => {
    const bad = new ApiError(400, 'VALIDATION_ERROR', 'Invalid body', [
      { path: 'venue', message: 'Name the venue.' },
    ]);
    expect(aiErrorMessage(bad)).toBe('Name the venue.');
    expect(aiErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'Offline.'))).toBe('Offline.');
  });
});

describe('sources', () => {
  it('links events and clubs to their pages, announcements to the feed', () => {
    expect(sourceHref({ type: 'event', id: 12 })).toBe('/dashboard/events/12');
    expect(sourceHref({ type: 'club', id: 3 })).toBe('/dashboard/clubs/3');
    expect(sourceHref({ type: 'announcement', id: 9 })).toBe('/dashboard/announcements');
    expect(sourceLabel({ type: 'announcement', id: 9 })).toBe('ANNOUNCEMENT #9');
  });
});

describe('chatLogParamsFromUrl', () => {
  it('keeps the filters the API accepts', () => {
    const params = chatLogParamsFromUrl(
      new URLSearchParams({
        user_id: '0b6c2f3e-8a3d-4c55-9a51-1f2e3d4c5b6a',
        user: 'Ayesha',
        search: '  fees ',
        from: '2026-11-01',
        to: '2026-11-14',
        page: '3',
      }),
    );
    expect(params).toEqual({
      user_id: '0b6c2f3e-8a3d-4c55-9a51-1f2e3d4c5b6a',
      search: 'fees',
      from: '2026-11-01',
      to: '2026-11-14',
      page: 3,
    });
  });

  it('drops a bad user id, an overlong search, bad dates and page 1', () => {
    const params = chatLogParamsFromUrl(
      new URLSearchParams({
        user_id: 'not-a-uuid',
        search: 'x'.repeat(101),
        from: '14/11/2026',
        to: 'yesterday',
        page: '1',
      }),
    );
    expect(params).toEqual({});
  });
});
