import { expect, test, type Page } from '@playwright/test';
import { USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// FR-DASH-001, FR-DASH-004 and FR-AUDIT-002 end to end, through the real UI and API (Neon test
// branch; DECISIONS D42, D43). A student sees their personal overview; the super admin sees the
// system overview with live health, then filters the audit log to their own sign-in and opens
// its details.

async function signOut(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('a student sees the personal overview', async ({ page }) => {
  await logIn(page, USERS.student.email);

  await expect(page.getByRole('region', { name: 'Your campus' })).toBeVisible();
  // The seeded student has no membership yet.
  const membership = page.getByRole('region', { name: 'Club membership' });
  await expect(membership.getByRole('link', { name: 'Become a member' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('region', { name: 'Upcoming events' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Latest announcements' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Blood requests for your group' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'System overview' })).toHaveCount(0);

  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoHorizontalScroll(page);
});

test('the super admin reads the system overview and the audit log', async ({ page }) => {
  test.setTimeout(150_000);
  await logIn(page, USERS.admin.email);

  // 1. The system overview: totals, health and recent activity.
  const system = page.getByRole('region', { name: 'System overview' });
  await expect(system.getByRole('link', { name: /Active users/ })).toBeVisible({
    timeout: 30_000,
  });
  const health = system.getByRole('region', { name: 'System health' });
  await expect(health.getByText('Database')).toBeVisible();
  await expect(health.getByRole('rowheader', { name: 'email' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'For you' })).toHaveCount(0);

  // 2. Into the audit log from the recent activity panel.
  await system.getByRole('link', { name: 'Open audit log' }).click();
  // The first visit compiles the route in `next dev`, which can outlast the 30 s default.
  await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible({
    timeout: 60_000,
  });
  const table = page.getByRole('table', { name: 'Audit log entries, newest first' });
  await expect(table).toBeVisible();

  // 3. Only sign-ins: the super admin's own login is there, with no email anywhere.
  await page.getByLabel('Action').selectOption('LOGIN');
  await expect(page).toHaveURL(/action=LOGIN/);
  const mine = table.getByRole('row').filter({ hasText: USERS.admin.name }).first();
  await expect(mine).toBeVisible();
  await expect(table.getByText('@e2e.test')).toHaveCount(0);

  // 4. Only this actor, then the details of one entry.
  await mine.getByRole('button', { name: /show only their entries/ }).click();
  await expect(page).toHaveURL(/user_id=/);
  await expect(page.getByText('Actor:')).toBeVisible();
  await table
    .getByRole('button', { name: /^Inspect/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Login' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(USERS.admin.name)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // 5. A backwards date range is refused on the page, before any request.
  await page.getByLabel('From', { exact: true }).fill('2026-12-31');
  await page.getByLabel('To', { exact: true }).fill('2026-01-01');
  await expect(page.getByText('The start date must be on or before the end date.')).toBeVisible();

  await signOut(page);
});
