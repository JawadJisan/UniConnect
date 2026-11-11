import { expect, test, type Page } from '@playwright/test';
import { USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// FR-MEM-001–005 through the real UI and API on the Neon test branch, with the mock payment
// gateway (PAYMENT_GATEWAY=mock, DECISIONS D32): the checkout redirects to the sandbox page,
// whose buttons post the IPN the gateway would send. The E2E seed gives the CSE club fees and
// wipes memberships on each run. The tests in this file run in order and build on each other.

test.describe.configure({ mode: 'serial' });

async function openMembership(page: Page) {
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .first()
    .getByRole('link', { name: 'Membership' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Membership' })).toBeVisible();
}

const statusCard = (page: Page) => page.getByRole('region', { name: /CSE Club/ });

async function payInSandbox(page: Page, outcome: 'Simulate payment success' | 'Simulate failure') {
  await expect(page).toHaveURL(/\/dashboard\/memberships\/checkout\/mock\?tran_id=UC-/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sandbox checkout' })).toBeVisible();
  await page.getByRole('button', { name: outcome }).click();
}

test('a student buys a monthly membership through the sandbox checkout', async ({ page }) => {
  await logIn(page, USERS.student.email);
  await openMembership(page);
  await expect(statusCard(page).getByText("You're not a member of CSE Club.")).toBeVisible();

  await statusCard(page).getByRole('button', { name: 'Purchase membership' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(/Monthly/)).toBeChecked();
  await dialog.getByRole('button', { name: 'Continue to payment' }).click();

  await payInSandbox(page, 'Simulate payment success');
  await expect(page).toHaveURL(/\/dashboard\/memberships$/);
  await expect(page.getByText("You're a member of CSE Club.")).toBeVisible();
  await expect(statusCard(page).getByText('Active', { exact: true })).toBeVisible();
  await expect(statusCard(page).getByText('EXPIRES IN')).toBeVisible();

  const history = page.getByRole('table', { name: 'Your memberships, newest first' });
  await expect(history.getByRole('row')).toHaveCount(2);
  await expect(history.getByText('Paid')).toBeVisible();
});

test('the student renews early, and the renewal is scheduled after the current one', async ({
  page,
}) => {
  await logIn(page, USERS.student.email);
  await openMembership(page);
  await statusCard(page).getByRole('button', { name: 'Renew' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/the day after your current membership ends/)).toBeVisible();
  await dialog.getByLabel(/Yearly/).check();
  await dialog.getByRole('button', { name: 'Continue to payment' }).click();

  await payInSandbox(page, 'Simulate payment success');
  await expect(page.getByText('Renewal confirmed.')).toBeVisible();
  await expect(statusCard(page).getByText(/Your renewal is paid and starts on/)).toBeVisible();
  await expect(statusCard(page).getByRole('button', { name: 'Renew' })).toHaveCount(0);
  const history = page.getByRole('table', { name: 'Your memberships, newest first' });
  await expect(history.getByText('Scheduled')).toBeVisible();
  await expect(history.getByText('৳5,000.00')).toBeVisible();
});

test('a failed payment starts no membership', async ({ page }) => {
  await logIn(page, USERS.student2.email);
  await openMembership(page);
  await statusCard(page).getByRole('button', { name: 'Purchase membership' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Continue to payment' }).click();

  await payInSandbox(page, 'Simulate failure');
  await expect(page).toHaveURL(/\/dashboard\/memberships\?checkout=failed$/);
  await expect(page.getByText("The payment didn't go through.")).toBeVisible();
  await expect(statusCard(page).getByText("You're not a member of CSE Club.")).toBeVisible();
  const history = page.getByRole('table', { name: 'Your memberships, newest first' });
  await expect(history.getByText('Cancelled')).toBeVisible();
  await expect(history.getByText('Failed')).toBeVisible();
});

test('a super admin sees every membership and filters by status', async ({ page }) => {
  await logIn(page, USERS.admin.email);
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .first()
    .getByRole('link', { name: 'Memberships' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Memberships' })).toBeVisible();
  const table = page.getByRole('table', { name: 'Memberships, newest first' });
  // Active and scheduled for the first student, cancelled for the second.
  await expect(table.getByRole('row')).toHaveCount(4);

  await page.getByLabel('Status').selectOption('scheduled');
  await expect(page).toHaveURL(/status=scheduled/);
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByText(USERS.student.name, { exact: true })).toBeVisible();
});

test.describe('on a 375px screen', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the membership page never scrolls sideways', async ({ page }) => {
    await logIn(page, USERS.student.email);
    await page.goto('/dashboard/memberships');
    await expect(statusCard(page)).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
