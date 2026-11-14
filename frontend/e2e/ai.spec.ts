import { expect, test, type Page } from '@playwright/test';
import { USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// FR-AI-001–003 end to end, through the real UI and API (Neon test branch; DECISIONS D44, D45).
// The API runs with Gemini blanked (playwright.config.ts), so these tests mock the AI answers
// with page.route and never reach Google. One test leaves the ask unmocked on purpose: the real
// API answers 503 AI_NOT_CONFIGURED through the Next.js rewrite. e2e/ai.live.spec.ts checks the
// real model.

const LIVE = process.env.AI_LIVE === '1';

// The overview refetches in the background; a patched request still in flight when a test ends
// must not fail it.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

/** Reports the assistant as configured on the personal view, keeping the rest of the answer. */
async function assistantOn(page: Page) {
  await page.route('**/api/v1/dashboard/student', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.chatbot = { enabled: true };
    await route.fulfill({ response, json: body });
  });
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  status,
  contentType: 'application/json',
  headers,
  body: JSON.stringify(body),
});

/** A datetime-local value `days` from now, in Dhaka time (UTC+6), as the form expects it. */
function dhakaInput(days: number, hour: number): string {
  const d = new Date(Date.now() + days * 86_400_000 + 6 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00`;
}

test('a student asks the assistant and meets the rate limit', async ({ page }) => {
  await assistantOn(page);
  let asks = 0;
  await page.route('**/api/v1/chatbot/ask', (route) => {
    asks += 1;
    return route.fulfill(
      asks === 1
        ? json(200, {
            success: true,
            data: {
              answer: 'The CSE Fair is on 2 December in Hall A.',
              sources: [{ type: 'club', id: 1 }],
            },
          })
        : json(
            429,
            { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
            { 'Retry-After': '30' },
          ),
    );
  });
  await logIn(page, USERS.student.email);

  const assistant = page.getByRole('region', { name: 'Ask UniConnect' });
  await assistant.getByRole('button', { name: 'What events are coming up?' }).click();
  const thread = assistant.getByRole('log', { name: 'Conversation with the assistant' });
  await expect(thread.getByText('The CSE Fair is on 2 December in Hall A.')).toBeVisible();
  await expect(thread.getByRole('link', { name: 'CLUB #1' })).toHaveAttribute(
    'href',
    '/dashboard/clubs/1',
  );

  const question = assistant.getByLabel('Your question');
  await question.fill('And next week?');
  await expect(assistant.getByText('14 / 500')).toBeVisible();
  await question.press('Enter');
  await expect(assistant.getByText(/reached the limit of 10 AI requests a minute/)).toBeVisible();
  await expect(question).toBeDisabled();
  await expect(thread.getByText('Not sent')).toBeVisible();

  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoHorizontalScroll(page);
});

test('the real API says when Gemini is not set up', async ({ page }) => {
  test.skip(LIVE, 'With AI_LIVE=1 the API has a real key.');
  await assistantOn(page);
  await logIn(page, USERS.student.email);

  const assistant = page.getByRole('region', { name: 'Ask UniConnect' });
  await assistant.getByLabel('Your question').fill('Any events this week?');
  await assistant.getByRole('button', { name: 'Ask' }).click();
  await expect(assistant.getByText("The assistant isn't set up on this server.")).toBeVisible();
  await expect(assistant.getByLabel('Your question')).toHaveCount(0);
});

test('the super admin reads the chatbot logs', async ({ page }) => {
  const rows = [
    {
      id: 7,
      question: 'How much is the CSE Club fee?',
      answer: `The monthly fee is ৳200.\n${'Ask the committee for details. '.repeat(10)}`,
      created_at: '2026-11-14T06:30:00.000Z',
      user: { id: '0b6c2f3e-8a3d-4c55-9a51-1f2e3d4c5b6a', name: 'Ayesha Rahman', role: 'student' },
    },
  ];
  const seen: URL[] = [];
  await page.route('**/api/v1/admin/chatbot/logs*', (route) => {
    seen.push(new URL(route.request().url()));
    return route.fulfill(
      json(200, {
        success: true,
        data: rows,
        meta: { page: 1, limit: 20, total: 1, total_pages: 1 },
      }),
    );
  });
  await logIn(page, USERS.admin.email);

  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Go to' });
  await page.keyboard.type('chatbot');
  await palette.getByRole('option', { name: 'Chatbot logs' }).click();
  await expect(page).toHaveURL(/\/dashboard\/admin\/chatbot-logs$/);
  // The first visit compiles the route in `next dev`.
  await expect(page.getByRole('heading', { level: 1, name: 'Chatbot logs' })).toBeVisible({
    timeout: 60_000,
  });

  const table = page.getByRole('table', { name: 'Chatbot questions, newest first' });
  await expect(table.getByText('How much is the CSE Club fee?')).toBeVisible();
  await expect(table).not.toContainText('@');

  // The overview stays mounted (hidden) after client navigation, so name the search box by role.
  await page.getByRole('searchbox', { name: 'Question' }).fill('fee');
  await expect(page).toHaveURL(/search=fee/);
  await expect.poll(() => seen.at(-1)?.searchParams.get('search')).toBe('fee');

  await table.getByRole('button', { name: /Ayesha Rahman/ }).click();
  await expect(page).toHaveURL(/user_id=0b6c2f3e/);
  await expect(page.getByText('User:')).toBeVisible();

  await table.getByRole('button', { name: 'View question 7' }).click();
  const dialog = page.getByRole('dialog', { name: 'Question #7' });
  await expect(dialog.getByText(/Ask the committee for details/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('an organizer drafts a description with AI', async ({ page }) => {
  const drafts = ['A night of building for the CSE Club.', 'A second, livelier draft.'];
  const bodies: unknown[] = [];
  await page.route('**/api/v1/ai/generate-event-description', (route) => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill(
      json(200, { success: true, data: { description: drafts[bodies.length - 1] } }),
    );
  });
  await logIn(page, USERS.admin.email);
  await page.getByRole('link', { name: 'New event' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();

  const draft = page.getByRole('button', { name: 'Draft with AI' });
  await expect(draft).toBeDisabled();
  await page.getByLabel('Title').fill('E2E Draft Night');
  await page.getByLabel('Organizing club').selectOption({ label: 'CSE Club' });
  await page.getByLabel('Starts').fill(dhakaInput(4, 14));
  await page.getByLabel(/^Venue/).fill('Hall 3');
  await expect(draft).toBeEnabled();

  await draft.click();
  const description = page.getByLabel(/^Description/);
  await expect(description).toHaveValue(drafts[0]!);
  expect(bodies[0]).toMatchObject({
    title: 'E2E Draft Night',
    club_name: 'CSE Club',
    venue: 'Hall 3',
  });

  await draft.click();
  const confirm = page.getByRole('dialog', { name: 'Replace the current description?' });
  await confirm.getByRole('button', { name: 'Replace' }).click();
  await expect(description).toHaveValue(drafts[1]!);
});
