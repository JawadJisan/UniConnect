import { expect, test, type Page } from '@playwright/test';
import { USERS } from './db';
import { expectNoHorizontalScroll, logIn } from './helpers';

// FR-ADMIN and FR-COMM end to end, through the real UI and API (Neon test branch, DECISIONS
// D34, D35): a super admin appoints a dept admin, who assigns a student to the committee, and
// each role change shows up in the account tag of the person it applies to.

const faculty = USERS.faculty;
const student = USERS.student;

/** The sidebar's account tag ("Moderator · CSE"), shown at desktop widths. */
const accountTag = (page: Page, text: string) =>
  page.getByRole('complementary').getByText(text, { exact: true });

/** Signing out lands on the home page (auth.spec.ts). */
async function signOut(page: Page) {
  await page.getByRole('banner').getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('dept admin and committee terms change roles, and ending them changes them back', async ({
  page,
}) => {
  // 1. The super admin appoints Dr. Karim Hossain as CSE dept admin.
  await logIn(page, USERS.admin.email);
  await page.getByRole('link', { name: 'Dept admins' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Department admins' })).toBeVisible();
  await page.getByRole('button', { name: 'Assign dept admin' }).click();
  let dialog = page.getByRole('dialog', { name: 'Assign a department admin' });
  await dialog.getByLabel('Department').selectOption({ label: 'CSE' });
  await dialog.getByLabel('Faculty member: search').fill('karim');
  await dialog.getByRole('radio', { name: new RegExp(faculty.name) }).check();
  await dialog.getByRole('button', { name: 'Assign dept admin' }).click();
  await expect(page.getByText(`${faculty.name} is now the CSE department admin.`)).toBeVisible();
  const termRow = page.getByRole('row', { name: new RegExp(faculty.name) });
  await expect(termRow.getByText('Current')).toBeVisible();
  await signOut(page);

  // 2. Karim is now a dept admin and assigns Ayesha to the committee from My club.
  await logIn(page, faculty.email);
  await expect(accountTag(page, 'Department admin · CSE')).toBeVisible();
  await page.getByRole('link', { name: 'My club' }).first().click();
  const committee = page.getByRole('region', { name: 'Committee' });
  await committee.getByRole('button', { name: 'Assign member' }).click();
  dialog = page.getByRole('dialog', { name: 'Assign a committee member' });
  await dialog.getByLabel('Person: search').fill('ayesha');
  await dialog.getByRole('radio', { name: new RegExp(student.name) }).check();
  await dialog.getByLabel('Position').fill('President');
  await dialog.getByRole('button', { name: `Assign ${student.name}` }).click();
  await expect(page.getByText(`${student.name} assigned as President.`)).toBeVisible();
  await expect(committee.getByRole('row', { name: new RegExp(student.name) })).toBeVisible();
  await signOut(page);

  // 3. Ayesha is a moderator now.
  await logIn(page, student.email);
  await expect(accountTag(page, 'Moderator · CSE')).toBeVisible();
  await signOut(page);

  // 4. Karim ends her term; she is a student again.
  await logIn(page, faculty.email);
  await page.getByRole('link', { name: 'My club' }).first().click();
  await page
    .getByRole('region', { name: 'Committee' })
    .getByRole('button', { name: `End term for ${student.name}` })
    .click();
  await page
    .getByRole('dialog', { name: new RegExp(`End ${student.name}'s term`) })
    .getByRole('button', { name: 'End term' })
    .click();
  await expect(page.getByText(`${student.name}'s term as President ended.`)).toBeVisible();
  await signOut(page);

  await logIn(page, student.email);
  await expect(accountTag(page, 'Student · CSE')).toBeVisible();
  await signOut(page);

  // 5. The super admin ends Karim's term early; the list holds at 375px.
  await logIn(page, USERS.admin.email);
  await page.goto('/dashboard/admin/dept-admins');
  await page.getByRole('button', { name: new RegExp(`End early ${faculty.name}`) }).click();
  await page
    .getByRole('dialog', { name: new RegExp(`End ${faculty.name}'s term early`) })
    .getByRole('button', { name: 'End term' })
    .click();
  await expect(
    page.getByText(`${faculty.name} is no longer the CSE department admin.`),
  ).toBeVisible();
  await expect(
    page.getByRole('row', { name: new RegExp(faculty.name) }).getByText('Ended'),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 800 });
  await expectNoHorizontalScroll(page);
});
