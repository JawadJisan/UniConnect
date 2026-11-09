import { expect, test } from '@playwright/test';
import { USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// The signed-in shell for each user type: navigation, account tag, palette and small screens.

test.describe('workspace shell', () => {
  for (const [who, user, tag] of [
    ['student', USERS.student, 'Student · CSE'],
    ['faculty', USERS.faculty, 'Faculty · CSE'],
    ['super admin', USERS.admin, 'Super admin'],
  ] as const) {
    test(`${who}: overview, navigation and account tag`, async ({ page }) => {
      await logIn(page, user.email);
      const nav = page.getByRole('navigation', { name: 'Workspace' });
      await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(nav.getByRole('link')).toHaveCount(2);
      await expect(page.getByRole('complementary').getByText(tag, { exact: true })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Your profile' })).toBeVisible();

      await nav.getByRole('link', { name: 'Profile' }).click();
      await expect(page).toHaveURL(/\/dashboard\/profile$/);
      await expect(nav.getByRole('link', { name: 'Profile' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  }

  test('the palette moves between pages from the keyboard', async ({ page }) => {
    await logIn(page, USERS.student.email);
    await page.keyboard.press('Control+k');
    const palette = page.getByRole('dialog', { name: 'Go to' });
    await expect(palette).toBeVisible();
    await page.keyboard.type('prof');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/dashboard\/profile$/);
    await expect(palette).toBeHidden();
  });
});

test.describe('small screens', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the drawer navigates, and neither page scrolls sideways', async ({ page }) => {
    await logIn(page, USERS.student.email);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: 'Profile' }).click();
    await expect(page).toHaveURL(/\/dashboard\/profile$/);
    await expect(drawer).toBeHidden();
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });
});
