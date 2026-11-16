import { expect, test, type Page } from '@playwright/test';
import { USERS } from './db';
import { logIn } from './helpers';

// The real Gemini model, end to end (FR-AI-001–003; DECISIONS D44, D45). Opt-in only:
//
//   AI_LIVE=1 pnpm --filter @uniconnect/frontend exec playwright test e2e/ai.live.spec.ts
//
// With AI_LIVE=1, playwright.config.ts keeps GEMINI_API_KEY and GEMINI_MODEL from backend/.env,
// so the API calls Google. Still the Neon test branch, never development or production. Three
// Gemini calls per run, under the 10-a-minute limit. Every other spec mocks the AI routes.

test.skip(process.env.AI_LIVE !== '1', 'Set AI_LIVE=1 to call the real Gemini model.');

const QUESTION = 'What events are coming up? My number is 01712345678.';
const FALLBACK = /I don't have information about that/;

async function signOut(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
}

function dhakaInput(days: number, hour: number): string {
  const d = new Date(Date.now() + days * 86_400_000 + 6 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00`;
}

test('the real model answers, is logged without PII, and drafts a description', async ({
  page,
}) => {
  test.setTimeout(240_000);

  // 1. A student asks; the dashboard reports the assistant on because the key is real.
  await logIn(page, USERS.student.email);
  const assistant = page.getByRole('region', { name: 'Ask UniConnect' });
  const question = assistant.getByLabel('Your question');
  await expect(question).toBeVisible();
  await question.fill(QUESTION);

  const started = Date.now();
  const reply = page.waitForResponse('**/api/v1/chatbot/ask');
  await assistant.getByRole('button', { name: 'Ask' }).click();
  const response = await reply;
  const ms = Date.now() - started;
  const body = await response.json();
  test.info().annotations.push({ type: 'ask latency', description: `${ms} ms` });
  console.log(`[ai.live] ask: HTTP ${response.status()} in ${ms} ms`);
  console.log(`[ai.live] answer: ${JSON.stringify(body.data?.answer ?? body.error)}`);
  console.log(`[ai.live] sources: ${JSON.stringify(body.data?.sources ?? [])}`);

  expect(response.status()).toBe(200);
  const answer: string = body.data.answer;
  expect(answer.trim().length).toBeGreaterThan(0);
  const thread = assistant.getByRole('log', { name: 'Conversation with the assistant' });
  await expect(thread.getByText(answer.trim().slice(0, 40), { exact: false })).toBeVisible();
  // Every source is something the student may open.
  for (const link of await thread.getByRole('link').all()) {
    const href = await link.getAttribute('href');
    expect(href).toMatch(/^\/dashboard\/(events\/\d+|clubs\/\d+|announcements)$/);
  }
  if (FALLBACK.test(answer)) console.log('[ai.live] the model gave the fallback sentence');
  await signOut(page);

  // 2. The super admin sees the question in the log, with the phone number stripped.
  await logIn(page, USERS.admin.email);
  await page.goto('/dashboard/admin/chatbot-logs');
  await expect(page.getByRole('heading', { level: 1, name: 'Chatbot logs' })).toBeVisible({
    timeout: 60_000,
  });
  const table = page.getByRole('table', { name: 'Chatbot questions, newest first' });
  const row = table.getByRole('row', { name: new RegExp(USERS.student.name) }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('What events are coming up?');
  await expect(row).not.toContainText('01712345678');

  // 3. A draft description for a new event.
  await page.goto('/dashboard/events/new');
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByLabel('Title').fill('Live AI Check: Robotics Workshop');
  await page.getByLabel('Organizing club').selectOption({ label: 'CSE Club' });
  await page.getByLabel('Starts').fill(dhakaInput(5, 15));
  await page.getByLabel(/^Venue/).fill('Lab 4');

  const draftStarted = Date.now();
  const draftReply = page.waitForResponse('**/api/v1/ai/generate-event-description');
  await page.getByRole('button', { name: 'Draft with AI' }).click();
  const draftResponse = await draftReply;
  const draftMs = Date.now() - draftStarted;
  const draftBody = await draftResponse.json();
  console.log(`[ai.live] draft: HTTP ${draftResponse.status()} in ${draftMs} ms`);
  console.log(
    `[ai.live] draft text: ${JSON.stringify(draftBody.data?.description ?? draftBody.error)}`,
  );
  expect(draftResponse.status()).toBe(200);
  const description = page.getByLabel(/^Description/);
  await expect(description).not.toHaveValue('');
  // The organizer still has to save: nothing was created.
  await expect(page).toHaveURL(/\/dashboard\/events\/new$/);
});
