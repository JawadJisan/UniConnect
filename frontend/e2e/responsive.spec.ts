import { expect, test, type Page } from '@playwright/test';
import { USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// Mobile-first gate (frontend rules: no horizontal scroll at 375px; Phase 10, D46). Every major
// page, as each kind of account, at a phone's width. The page must render its heading and must
// not scroll sideways.

test.describe.configure({ timeout: 300_000 });

async function check(page: Page, path: string) {
  await page.goto(path);
  // The first visit to a route compiles it in `next dev`.
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 60_000,
  });
  await expectNoHorizontalScroll(page);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
});

test('a student’s pages fit a 375px screen', async ({ page }) => {
  await logIn(page, USERS.student.email);
  for (const path of [
    '/dashboard',
    '/dashboard/profile',
    '/dashboard/clubs',
    '/dashboard/clubs/my-club',
    '/dashboard/memberships',
    '/dashboard/events',
    '/dashboard/events/my-registrations',
    '/dashboard/announcements',
  ]) {
    await check(page, path);
  }

  await check(page, '/dashboard/blood');
  for (const tab of ['Donors', 'My donations', 'Requests']) {
    await page.getByRole('tab', { name: tab }).click();
    await expectNoHorizontalScroll(page);
  }
});

test('a faculty member’s overview and blood hub fit a 375px screen', async ({ page }) => {
  await logIn(page, USERS.faculty.email);
  await check(page, '/dashboard');
  await check(page, '/dashboard/blood');
});

test('the super admin’s pages fit a 375px screen', async ({ page }) => {
  await logIn(page, USERS.admin.email);
  for (const path of [
    '/dashboard',
    '/dashboard/admin/users',
    '/dashboard/admin/memberships',
    '/dashboard/admin/dept-admins',
    '/dashboard/admin/blood-verifications',
    '/dashboard/admin/audit-logs',
    '/dashboard/admin/chatbot-logs',
    '/dashboard/events/new',
  ]) {
    await check(page, path);
  }

  // A record page: the first club, and the first event if the suite left one.
  await check(page, '/dashboard/clubs');
  await page.getByRole('main').getByRole('link').filter({ hasText: 'Club' }).first().click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 60_000,
  });
  await expectNoHorizontalScroll(page);

  await check(page, '/dashboard/events');
  const event = page.getByRole('main').getByRole('list').getByRole('link').first();
  if (await event.count()) {
    await event.click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 60_000,
    });
    await expectNoHorizontalScroll(page);
  }
});
