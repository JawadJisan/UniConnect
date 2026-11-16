import { expect, test, type Page } from '@playwright/test';
import { USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// FR-ANNOUNCE end to end, through the real UI and API (Neon test branch, DECISIONS D15, D38):
// the super admin posts a pinned CSE announcement and an ECE one, a CSE student sees only the
// CSE one, pinned first, and the admin edits and then deletes it. The seed truncates users,
// which cascades to announcements, so every run starts empty.

const CSE_TITLE = 'E2E Exam week';
const ECE_TITLE = 'E2E ECE lab closure';

async function signOut(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function openFeed(page: Page) {
  await page.getByRole('link', { name: 'Announcements' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Announcements' })).toBeVisible();
}

async function postToDepartment(page: Page, department: string, title: string, pinned: boolean) {
  await page.getByRole('button', { name: 'New announcement' }).click();
  const dialog = page.getByRole('dialog', { name: 'New announcement' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Announcement').fill(`${title}: details for everyone.`);
  await dialog.getByLabel('Department', { exact: true }).selectOption({ label: department });
  if (pinned) await dialog.getByLabel('Pin to the top').check();
  await dialog.getByRole('button', { name: 'Post announcement' }).click();
  await expect(page.getByText('Announcement posted.')).toBeVisible();
  await expect(dialog).toBeHidden();
}

test('a super admin posts and pins, a student sees only their department, then edit and delete', async ({
  page,
}) => {
  // 1. The super admin posts a pinned CSE announcement and an ECE one.
  await logIn(page, USERS.admin.email);
  await openFeed(page);
  await postToDepartment(page, 'ECE', ECE_TITLE, false);
  await postToDepartment(page, 'CSE', CSE_TITLE, true);
  const pinned = page.getByRole('article', { name: CSE_TITLE });
  await expect(pinned.getByText('Pinned', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: ECE_TITLE })).toBeVisible();
  await signOut(page);

  // 2. A CSE student sees the CSE post first, pinned, and never the ECE one (D15).
  await logIn(page, USERS.student.email);
  await openFeed(page);
  const articles = page.getByRole('article');
  await expect(articles.first()).toHaveAccessibleName(CSE_TITLE);
  await expect(articles.first().getByText('Pinned', { exact: true })).toBeVisible();
  await expect(articles.first().getByText('DEPARTMENT · CSE')).toBeVisible();
  await expect(page.getByRole('article', { name: ECE_TITLE })).toHaveCount(0);
  // A student can't post, pin, edit or delete.
  await expect(page.getByRole('button', { name: 'New announcement' })).toHaveCount(0);
  await expect(articles.first().getByRole('button')).toHaveCount(0);
  await signOut(page);

  // 3. The admin unpins, edits, then deletes the CSE post after confirming.
  await logIn(page, USERS.admin.email);
  await openFeed(page);
  await page.getByRole('button', { name: `Unpin ${CSE_TITLE}` }).click();
  await expect(page.getByText('Unpinned.')).toBeVisible();
  await expect(
    page.getByRole('article', { name: CSE_TITLE }).getByText('Pinned', { exact: true }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: `Edit ${CSE_TITLE}` }).click();
  const edit = page.getByRole('dialog', { name: 'Edit announcement' });
  await edit.getByLabel('Title').fill(`${CSE_TITLE} moved`);
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Announcement updated.')).toBeVisible();
  const renamed = page.getByRole('article', { name: `${CSE_TITLE} moved` });
  await expect(renamed).toBeVisible();

  await page.getByRole('button', { name: `Delete ${CSE_TITLE} moved` }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete this announcement?' });
  await confirm.getByRole('button', { name: 'Delete announcement' }).click();
  await expect(page.getByText('Announcement deleted.')).toBeVisible();
  await expect(renamed).toHaveCount(0);
});

test.describe('on a 375px screen', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('the feed and the new-announcement dialog fit without sideways scrolling', async ({
    page,
  }) => {
    await logIn(page, USERS.admin.email);
    await page.goto('/dashboard/announcements');
    await expect(page.getByRole('heading', { level: 1, name: 'Announcements' })).toBeVisible();
    await expect(page.getByRole('article', { name: ECE_TITLE })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'New announcement' }).click();
    await expect(page.getByRole('dialog', { name: 'New announcement' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
