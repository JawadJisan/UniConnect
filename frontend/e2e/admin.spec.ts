import { expect, test } from '@playwright/test';
import { PASSWORD, USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// FR-USER-005 and the FR-USER-002 assisting edit, through the real UI and API (Neon test
// branch). student3 is used only here, so the other specs never meet a suspended account.

const target = USERS.student3;

test('a super admin finds, suspends and reactivates a student', async ({ page, browser }) => {
  // The student is signed in on another device before the suspension.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await logIn(otherPage, target.email);

  await logIn(page, USERS.admin.email);
  await page.getByRole('link', { name: 'Users' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();

  await page.getByLabel('Search by name or email').fill('nadia');
  await expect(page).toHaveURL(/search=nadia/);
  await page.getByRole('link', { name: new RegExp(target.name) }).click();
  await expect(page.getByRole('heading', { level: 1, name: target.name })).toBeVisible();

  await page.getByRole('button', { name: 'Suspend account' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Reason/).fill('E2E check');
  await dialog.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByText(`${target.name} is suspended.`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activate account' })).toBeVisible();

  // Their sessions were deleted: the other device is sent to log in, and can't.
  await otherPage.goto('/dashboard');
  await expect(otherPage).toHaveURL(/\/login\?next=/);
  await otherPage.getByLabel('Email').fill(target.email);
  await otherPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await otherPage.getByRole('button', { name: 'Log in' }).click();
  await expect(otherPage.getByText('This account is suspended.')).toBeVisible();

  // The list shows the status in words.
  await page.goto('/dashboard/admin/users?is_active=false');
  // Scoped to the row: the Status filter also has a (hidden) "Suspended" option.
  const row = page.getByRole('row', { name: new RegExp(target.name) });
  await expect(row.getByText('Suspended')).toBeVisible();

  // Activate, and the student can sign in again.
  await page.getByRole('link', { name: new RegExp(target.name) }).click();
  await page.getByRole('button', { name: 'Activate account' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByText(`${target.name} is active again.`)).toBeVisible();
  await logIn(otherPage, target.email);
  await other.close();
});

test('a super admin corrects a student’s semester, and the student sees it', async ({
  page,
  browser,
}) => {
  await logIn(page, USERS.admin.email);
  await page.goto('/dashboard/admin/users?search=student3');
  await page.getByRole('link', { name: new RegExp(target.name) }).click();
  const details = page.getByRole('region', { name: 'Details' });
  await details.getByLabel('Semester').selectOption('2');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText(`Saved ${target.name}'s details.`)).toBeVisible();

  const other = await browser.newContext();
  const student = await other.newPage();
  await logIn(student, target.email);
  await student.goto('/dashboard/profile');
  await expect(student.getByLabel('Current semester')).toHaveValue('2');
  await other.close();
});

test('recompute role reports an already-correct role', async ({ page }) => {
  await logIn(page, USERS.admin.email);
  await page.goto('/dashboard/admin/users?search=student3');
  await page.getByRole('link', { name: new RegExp(target.name) }).click();
  await page.getByRole('button', { name: 'Recompute role' }).click();
  await expect(page.getByText('Role is already correct: Student.')).toBeVisible();
});

test('the list fits a 375px screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await logIn(page, USERS.admin.email);
  await page.goto('/dashboard/admin/users');
  await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(USERS.student.name) })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('a student cannot reach user management', async ({ page }) => {
  await logIn(page, USERS.student.email);
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
  await page.goto('/dashboard/admin/users');
  await expect(page.getByText("You don't have access to this page.")).toBeVisible();
});
