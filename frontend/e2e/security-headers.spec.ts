import { expect, test, type Page } from '@playwright/test';
import { USERS } from './db';
import { logIn } from './helpers';

// The frontend's security headers (DECISIONS §7 I3, D46): every page carries the CSP and
// frame-blocking headers, and no page breaks under them (no CSP violation in the console).

function collectViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}

test('public and auth pages carry the security headers', async ({ page }) => {
  for (const path of ['/', '/login', '/register']) {
    const response = await page.goto(path);
    const headers = response!.headers();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  }
});

test('signed-in pages load without CSP violations', async ({ page }) => {
  const violations = collectViolations(page);
  await logIn(page, USERS.student.email);
  for (const path of ['/dashboard/profile', '/dashboard/events', '/dashboard/blood']) {
    await page.goto(path);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(violations).toEqual([]);
});

test('the super admin pages load without CSP violations', async ({ page }) => {
  const violations = collectViolations(page);
  await logIn(page, USERS.admin.email);
  for (const path of ['/dashboard/admin/users', '/dashboard/admin/audit-logs']) {
    await page.goto(path);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({
      timeout: 60_000,
    });
  }
  expect(violations).toEqual([]);
});
