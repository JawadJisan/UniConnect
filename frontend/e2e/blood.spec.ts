import { expect, test, type Page } from '@playwright/test';
import { USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// FR-BLOOD end to end, through the real UI and API (Neon test branch, DECISIONS D40, D41), in
// two independent journeys. First, a student records a donation, the super admin verifies it
// from the queue, and the student then shows as a verified donor. Second, another student posts
// two requests, can't fulfill their own, cancels one, and the first student fulfills the other.
// The seed truncates users, which cascades to the blood tables, so every run starts empty.

async function signOut(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function openHub(page: Page) {
  await page.getByRole('link', { name: 'Blood donation' }).first().click();
  // The first visit compiles the route in `next dev`, which can outlast the 30 s default.
  await expect(page.getByRole('heading', { level: 1, name: 'Blood donation' })).toBeVisible({
    timeout: 60_000,
  });
}

async function postRequest(page: Page, patient: string) {
  await page.getByRole('button', { name: 'New blood request' }).click();
  const dialog = page.getByRole('dialog', { name: 'New blood request' });
  await dialog.getByLabel('Patient name').fill(patient);
  await dialog.getByLabel('Blood group').selectOption('O-');
  await dialog.getByLabel('Units needed').fill('2');
  await dialog.getByLabel('Hospital').fill('Dhaka Medical College Hospital');
  await dialog.getByLabel('Contact phone').fill('+8801711111111');
  await dialog.getByRole('button', { name: 'Post request' }).click();
  await expect(page.getByText('Blood request posted.')).toBeVisible();
  await expect(dialog).toBeHidden();
}

test('a student records a donation, the super admin verifies it, and the donor is listed', async ({
  page,
}) => {
  // 1. A student records a donation; it starts as PENDING.
  await logIn(page, USERS.student.email);
  await openHub(page);
  await page.getByRole('tab', { name: 'My donations' }).click();
  await expect(page).toHaveURL(/tab=donations/);
  await page.getByRole('button', { name: 'Record donation' }).first().click();
  const record = page.getByRole('dialog', { name: 'Record donation' });
  await expect(record.getByLabel('Blood group B positive')).toBeVisible();
  await record.getByLabel('Hospital or blood bank').fill('Red Crescent Blood Bank');
  await record.getByRole('button', { name: 'Record donation' }).click();
  await expect(
    page.getByText('Donation recorded. It counts once an admin verifies it.'),
  ).toBeVisible();
  await expect(page.getByRole('table').getByText('Pending', { exact: true })).toBeVisible();
  await signOut(page);

  // 2. The super admin verifies it from the queue.
  await logIn(page, USERS.admin.email);
  await page.getByRole('link', { name: 'Blood verifications' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Blood verifications' })).toBeVisible();
  await page.getByRole('button', { name: `Verify ${USERS.student.name}'s donation` }).click();
  const verify = page.getByRole('dialog', { name: 'Verify this donation?' });
  await verify.getByRole('button', { name: 'Verify donation' }).click();
  await expect(page.getByText(`Verified ${USERS.student.name}'s donation.`)).toBeVisible();
  await expect(page.getByText('Nothing to verify')).toBeVisible();
  // The super admin doesn't donate, so there is no My donations tab.
  await openHub(page);
  await expect(page.getByRole('tab', { name: 'My donations' })).toHaveCount(0);
  await signOut(page);

  // 3. The student is now VERIFIED, and listed as a verified donor (never with an email).
  await logIn(page, USERS.student.email);
  await openHub(page);
  await page.getByRole('tab', { name: 'My donations' }).click();
  await expect(page.getByRole('table').getByText('Verified', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Donors' }).click();
  const donorRow = page.getByRole('row', { name: new RegExp(USERS.student.name) });
  await expect(donorRow.getByText('Verified', { exact: true })).toBeVisible();
  await expect(page.getByRole('table')).not.toContainText('@e2e.test');
  await signOut(page);
});

test('a student posts requests and cancels one; another student fulfills the other', async ({
  page,
}) => {
  // 4. Another student posts two requests: no Fulfill on their own, and they cancel one.
  await logIn(page, USERS.student2.email);
  await openHub(page);
  await postRequest(page, 'E2E Patient One');
  await postRequest(page, 'E2E Patient Two');
  await expect(
    page.getByRole('button', { name: 'Fulfill the request for E2E Patient One' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel the request for E2E Patient Two' }).click();
  await page
    .getByRole('dialog', { name: 'Cancel this request?' })
    .getByRole('button', { name: 'Cancel request' })
    .click();
  await expect(page.getByText('Request cancelled.')).toBeVisible();
  await expect(page.getByRole('table')).not.toContainText('E2E Patient Two');
  await signOut(page);

  // 5. The first student fulfills the remaining request; the pending list empties.
  await logIn(page, USERS.student.email);
  await openHub(page);
  await page.getByRole('button', { name: 'Fulfill the request for E2E Patient One' }).click();
  await page
    .getByRole('dialog', { name: 'Fulfill this request?' })
    .getByRole('button', { name: 'Mark as fulfilled' })
    .click();
  await expect(page.getByText('Marked as fulfilled. Thank you.')).toBeVisible();
  await expect(page.getByText('No open blood requests')).toBeVisible();

  // 6. The hub fits a phone screen.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole('tab', { name: 'Donors' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
