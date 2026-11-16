import { expect, type Page } from '@playwright/test';
import { PASSWORD } from './db';

/**
 * Logs in through the real form, then waits until the workspace has loaded the profile (the
 * page heading is rendered inside the shell), so keyboard shortcuts and links are live. The
 * sidebar is hidden on small screens, so the heading is the signal at every width.
 */
export async function logIn(
  page: Page,
  email: string,
  password = PASSWORD,
  landing = /\/dashboard$/,
) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(landing);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
}

/** Fails if the page scrolls sideways at the current viewport. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
