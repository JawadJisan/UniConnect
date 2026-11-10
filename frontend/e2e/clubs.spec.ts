import { expect, test } from '@playwright/test';
import { USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// FR-CLUB-001–004 through the real UI and API (Neon test branch). The E2E seed creates one
// club per department and resets them each run. A dept_admin isn't seeded yet (task 1b); the
// unit tests and the backend RBAC matrix cover that role. Logo upload is unit-tested only,
// because Cloudinary is blanked in E2E.

test('a student opens their club and browses the others, without edit controls', async ({
  page,
}) => {
  await logIn(page, USERS.student.email);
  await page.getByRole('link', { name: 'My club' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'CSE Club' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Committee' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Details & fees' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Logo' })).toHaveCount(0);

  await page.getByRole('link', { name: 'All clubs' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Clubs' })).toBeVisible();
  await expect(page.getByText('3 clubs')).toBeVisible();
  await page.getByRole('link', { name: /ECE Club/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'ECE Club' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Details & fees' })).toHaveCount(0);
});

test('a super admin sets a club fee, and it stays after a reload', async ({ page }) => {
  await logIn(page, USERS.admin.email);
  await page.getByRole('link', { name: 'All clubs' }).first().click();
  await page.getByRole('link', { name: /CSE Club/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'CSE Club' })).toBeVisible();

  const form = page.getByRole('region', { name: 'Details & fees' });
  const save = form.getByRole('button', { name: 'Save club' });
  await expect(save).toBeDisabled();
  await form.getByLabel(/^Monthly fee/).fill('150');
  await save.click();
  await expect(page.getByText('Club details saved.')).toBeVisible();

  const about = page.getByRole('region', { name: 'About' });
  await expect(about.getByText('৳150.00')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'About' }).getByText('৳150.00')).toBeVisible();
});

test.describe('on a 375px screen', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the directory and a club page never scroll sideways', async ({ page }) => {
    await logIn(page, USERS.faculty.email);
    await page.goto('/dashboard/clubs');
    await expect(page.getByRole('link', { name: /CSE Club/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto('/dashboard/clubs/my-club');
    await expect(page.getByRole('heading', { level: 1, name: 'CSE Club' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
