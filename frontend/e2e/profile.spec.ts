import { expect, test } from '@playwright/test';
import { PASSWORD, USERS } from './db';
import { logIn } from './helpers';

// FR-USER through the real UI and API (Neon test branch). Cloudinary is never called: the
// avatar route is fulfilled by the test, and the real upload is covered by the API tests.

// A 1×1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('student profile', () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page, USERS.student.email);
    await page.goto('/dashboard/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  });

  test('personal and academic edits are saved and survive a reload', async ({ page }) => {
    const personal = page.getByRole('region', { name: 'Personal details' });
    await personal.getByLabel(/^Phone/).fill('+8801712345678');
    await page.getByRole('button', { name: 'Save details' }).click();
    await expect(page.getByText('Personal details saved.')).toBeVisible();

    const academic = page.getByRole('region', { name: 'Academic details' });
    await academic.getByLabel('Current year').selectOption('4');
    await page.getByRole('button', { name: 'Save academic details' }).click();
    await expect(page.getByText('Academic details saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/^Phone/)).toHaveValue('+8801712345678');
    await expect(page.getByLabel('Current year')).toHaveValue('4');
  });

  test("another student's ID in the department is refused on the field", async ({ page }) => {
    await page.getByLabel('Student ID').fill('CSE-E2E/002');
    await page.getByRole('button', { name: 'Save academic details' }).click();
    await expect(page.getByText('Student ID already registered.')).toBeVisible();
    await expect(page.getByLabel('Student ID')).toHaveAttribute('aria-invalid', 'true');
  });

  test('client validation stops a bad phone before the API', async ({ page }) => {
    let patched = false;
    page.on('request', (r) => {
      if (r.method() === 'PATCH' && r.url().endsWith('/api/v1/users/me')) patched = true;
    });
    await page.getByLabel(/^Phone/).fill('12ab');
    await page.getByRole('button', { name: 'Save details' }).click();
    await expect(page.getByLabel(/^Phone/)).toHaveAttribute('aria-invalid', 'true');
    expect(patched).toBe(false);
  });

  test('avatar: a wrong type is refused locally, a good image previews then uploads', async ({
    page,
  }) => {
    let uploads = 0;
    const url = 'https://res.cloudinary.com/demo/image/upload/v1/e2e-avatar.png';
    await page.route('**/api/v1/users/me/avatar', async (route) => {
      uploads += 1;
      const me = await (await page.request.get('/api/v1/users/me')).json();
      await route.fulfill({
        json: { success: true, message: 'Avatar updated.', data: { ...me.data, avatar_url: url } },
      });
    });
    // The stubbed URL isn't a real image; serve the same pixel for it.
    await page.route(url, (route) => route.fulfill({ body: PNG, contentType: 'image/png' }));

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: 'notes.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a'),
    });
    await expect(
      page.getByRole('alert').filter({ hasText: 'Choose a JPEG, PNG or WebP image.' }),
    ).toBeVisible();
    expect(uploads).toBe(0);

    await input.setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
    const zone = page.getByRole('region', { name: 'Photo and identity' });
    await expect(zone.locator('img[src^="blob:"]')).toBeVisible();
    expect(uploads).toBe(0);

    await page.getByRole('button', { name: 'Upload photo' }).click();
    await expect(page.getByText('Profile photo updated.')).toBeVisible();
    expect(uploads).toBe(1);
    await expect(zone.locator(`img[src="${url}"]`)).toBeVisible();
  });
});

test('faculty see no academic fields', async ({ page }) => {
  await logIn(page, USERS.faculty.email);
  await page.goto('/dashboard/profile');
  await expect(page.getByRole('heading', { name: 'Personal details' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Academic details' })).toHaveCount(0);
  await expect(page.getByLabel('Student ID')).toHaveCount(0);
});

test('changing the password works, and only the new one signs in', async ({ page, browser }) => {
  const NEW = 'N3w!passw0rd';
  await logIn(page, USERS.student2.email);

  // A second device, signed in before the change.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await logIn(otherPage, USERS.student2.email);

  await page.goto('/dashboard/profile');
  const security = page.getByRole('region', { name: 'Password' });
  await security.getByLabel('Current password').fill('Wr0ng!pass');
  await security.getByLabel('New password', { exact: true }).fill(NEW);
  await security.getByLabel('Confirm new password').fill(NEW);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText("That isn't your current password.")).toBeVisible();

  await security.getByLabel('Current password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();

  // This device stays in; the other one was signed out.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  await otherPage.goto('/dashboard');
  await expect(otherPage).toHaveURL(/\/login\?next=/);
  await other.close();

  // Old password refused, new one accepted.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(USERS.student2.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  await logIn(page, USERS.student2.email, NEW);
});

test('"Sign out other devices" ends the other session and keeps this one', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await logIn(otherPage, USERS.faculty.email);

  await logIn(page, USERS.faculty.email);
  await page.goto('/dashboard/profile');
  const devices = page.getByRole('region', { name: 'Devices' });
  await expect(devices.getByText(/and \d+ other devices?\./)).toBeVisible();
  await devices.getByRole('button', { name: 'Sign out other devices' }).click();
  await expect(page.getByText('Signed out of your other devices.')).toBeVisible();
  await expect(devices.getByText('Only this device is signed in.')).toBeVisible();

  await otherPage.goto('/dashboard');
  await expect(otherPage).toHaveURL(/\/login\?next=/);
  await other.close();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
});
