import { expect, test, type APIRequestContext } from '@playwright/test';
import { e2eDb, PASSWORD, USERS } from './db';
import { logIn } from './helpers';

// FR-AUTH through the real UI and API (Neon test branch).

test.describe('registration and first sign-in', () => {
  const email = `new.student.${Date.now()}@e2e.test`;

  test('a new student registers, is held at verification, then signs in to the dashboard', async ({
    page,
  }) => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Nusrat Jahan');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page
      .getByLabel('Department')
      .selectOption({ label: 'CSE (Computer Science and Engineering)' });
    await page.getByLabel('Student ID').fill(`NEW-${Date.now()}`);
    await page.getByLabel('Academic session').fill('2024-2025');
    await page.getByLabel('Year').selectOption('1');
    await page.getByLabel('Semester').selectOption('1');
    await page.getByLabel('Blood group').selectOption('AB+');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/verify-email\?email=/);
    await expect(page.getByRole('heading', { level: 1, name: 'Check your inbox' })).toBeVisible();

    // Unverified: sign-in is refused with a way forward.
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Confirm your email first.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // Stand-in for opening the emailed link (the link is covered by the API integration tests).
    e2eDb('verify', email);

    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome, Nusrat' })).toBeVisible();
  });
});

test.describe('session handling', () => {
  test('a signed-out visit to a workspace page goes to log in and comes back', async ({ page }) => {
    await page.goto('/dashboard/profile');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fprofile$/);

    await page.getByLabel('Email').fill(USERS.student.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/dashboard\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();
  });

  test('a wrong password is refused plainly', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(USERS.student.email);
    await page.getByLabel('Password', { exact: true }).fill('Wr0ng!pass');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  });

  test('a signed-in visitor is sent from the auth pages to the dashboard', async ({ page }) => {
    await logIn(page, USERS.student.email);
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('signing out ends the session', async ({ page }) => {
    await logIn(page, USERS.faculty.email);
    await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test('a forged session cookie still cannot open the workspace', async ({ page, context }) => {
    // The proxy only checks that a cookie exists; the API decides.
    await context.addCookies([
      {
        name: 'better-auth.session_token',
        value: 'forged.value',
        domain: 'localhost',
        path: '/',
      },
    ]);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });
});

test('password reset answers the same whether or not the account exists', async ({
  page,
  request,
}) => {
  // Fresh addresses every run: the per-email reset limit (3 an hour) lives in Redis and is
  // not switched off by NODE_ENV=test.
  const stamp = Date.now();
  const existing = `reset.${stamp}@e2e.test`;
  const created = await request.post('/api/v1/auth/register/faculty', {
    data: {
      name: 'Reset Tester',
      email: existing,
      password: PASSWORD,
      department_id: await departmentId(request, 'CSE'),
      blood_group: 'A-',
    },
  });
  expect(created.status()).toBe(201);

  for (const email of [existing, `nobody.${stamp}@e2e.test`]) {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Check your inbox' })).toBeVisible();
    await expect(page.getByText(`If an account exists for ${email}`)).toBeVisible();
  }
});

async function departmentId(request: APIRequestContext, name: string) {
  const res = await request.get('/api/v1/departments');
  const body = (await res.json()) as { data: { id: number; name: string }[] };
  const dept = body.data.find((d) => d.name === name);
  if (!dept) throw new Error(`no department ${name}`);
  return dept.id;
}
