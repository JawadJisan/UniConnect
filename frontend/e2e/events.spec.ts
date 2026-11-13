import { expect, test, type Page } from '@playwright/test';
import { USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// FR-EVENT end to end, through the real UI and API (Neon test branch, DECISIONS D36): a super
// admin creates and publishes an event, a student registers, cancels and registers again, and
// the organizer checks them in and exports the list. The seed truncates users, so every run
// starts with no events.

const TITLE = 'E2E Hack Night';

/** A datetime-local value `days` from now, in Dhaka time (UTC+6), as the form expects it. */
function dhakaInput(days: number, hour: number): string {
  const d = new Date(Date.now() + days * 86_400_000 + 6 * 3_600_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00`;
}

async function signOut(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function openEvent(page: Page) {
  await page.getByRole('link', { name: 'Browse events' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(TITLE) }).click();
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
}

test('an organizer publishes an event, a student registers, and is checked in', async ({
  page,
}) => {
  // 1. The super admin creates a draft for the CSE club and publishes it.
  await logIn(page, USERS.admin.email);
  await page.getByRole('link', { name: 'New event' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'New event' })).toBeVisible();
  await page.getByLabel('Title').fill(TITLE);
  await page.getByLabel('Organizing club').selectOption({ label: 'CSE Club' });
  await page.getByLabel('Starts').fill(dhakaInput(3, 14));
  await page.getByLabel('Ends').fill(dhakaInput(3, 17));
  await page.getByLabel(/^Venue/).fill('Hall 2');
  await page.getByLabel(/^Capacity/).fill('10');
  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish this event?' });
  await dialog.getByRole('button', { name: 'Publish event' }).click();
  await expect(page.getByText('Event published.')).toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toBeHidden();
  await signOut(page);

  // 2. Ayesha finds it, registers, cancels, and registers again (the row is reused).
  await logIn(page, USERS.student.email);
  await openEvent(page);
  const registration = page.getByRole('region', { name: 'Registration' });
  await registration.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByText(`You're registered for ${TITLE}.`)).toBeVisible();
  await expect(registration.getByText('Registered', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'About' }).getByText('1 / 10')).toBeVisible();

  await registration.getByRole('button', { name: 'Cancel registration' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel registration' }).click();
  await expect(page.getByText('Registration cancelled.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'About' }).getByText('0 / 10')).toBeVisible();
  await registration.getByRole('button', { name: 'Register' }).click();
  await expect(registration.getByText('Registered', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'My registrations' }).first().click();
  const row = page.getByRole('row', { name: new RegExp(TITLE) });
  await expect(row.getByText('Registered', { exact: true })).toBeVisible();
  await signOut(page);

  // 3. The organizer checks her in and downloads the list.
  await logIn(page, USERS.admin.email);
  await openEvent(page);
  await page.getByRole('link', { name: 'Registrations & check-in' }).click();
  await page.getByRole('button', { name: `Check in ${USERS.student.name}` }).click();
  await expect(page.getByText(`${USERS.student.name} checked in.`)).toBeVisible();
  const person = page.getByRole('row', { name: new RegExp(USERS.student.name) });
  await expect(person.getByText('Attended', { exact: true })).toBeVisible();

  const href = await page.getByRole('link', { name: 'Download CSV' }).getAttribute('href');
  const csv = await page.request.get(href!);
  expect(csv.status()).toBe(200);
  expect(csv.headers()['content-type']).toContain('text/csv');
  const body = await csv.text();
  expect(body).toContain(USERS.student.name);
  expect(body).not.toContain(USERS.student.email);
});

test.describe('on a 375px screen', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('browse and the event page fit without sideways scrolling', async ({ page }) => {
    await logIn(page, USERS.student.email);
    await page.goto('/dashboard/events?status=all');
    await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('link', { name: new RegExp(TITLE) }).click();
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
