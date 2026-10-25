import { expect, test, type Page } from '@playwright/test';

// One household, built up step by step: onboarding → house ↔ tasks → completing → focus →
// partner invite → assignment → privacy.
test.describe.configure({ mode: 'serial' });

const OWNER = { name: 'Ghazi', email: 'ghazi@example.com', password: 'a very good password' };
const PARTNER = { name: 'Sam', email: 'sam@example.com', password: 'another good password' };

let ownerPage: Page;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  ownerPage = await context.newPage();
});

test.afterAll(async () => {
  await ownerPage.context().close();
});

async function openComposer(page: Page) {
  await page.getByRole('button', { name: 'New task' }).click();
  return page.getByRole('dialog', { name: 'New task' });
}

test('onboarding sets up the home with the expert maintenance plan', async () => {
  const page = ownerPage;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your home, at a glance' })).toBeVisible();
  await page.getByRole('button', { name: 'Set up our home' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Essentials for your house')).toBeVisible();
  await page.getByRole('button', { name: /Use \d+ items/ }).click();
  await page.getByLabel('Your name').fill(OWNER.name);
  await page.getByLabel('Email').fill(OWNER.email);
  await page.getByLabel('Password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Create our home' }).click();

  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening|night), Ghazi/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  await expect(page.getByRole('group', { name: /Your house/ })).toBeVisible();
  await expect(page.getByText('Test smoke & CO alarms').first()).toBeVisible();
});

test('selecting a room filters tasks and selecting a task lights up its fixture', async () => {
  const page = ownerPage;
  await page.getByRole('button', { name: /^Kitchen:/ }).click();
  await expect(page.getByRole('heading', { name: 'Kitchen' })).toBeVisible();
  const row = page.locator('[data-task-id]').filter({ hasText: 'Clean the dishwasher filter' });
  await row.getByRole('button').first().click();
  await expect(page.locator('.house-ring').first()).toBeVisible();
  await page.getByRole('button', { name: 'Details & how-to' }).click();
  const sheet = page.getByRole('dialog', { name: 'Clean the dishwasher filter' });
  await expect(sheet.getByText('Why it matters')).toBeVisible();
  await expect(sheet.getByText('How to do it')).toBeVisible();
});

test('completing a recurring task reschedules it and can be undone', async () => {
  const page = ownerPage;
  const sheet = page.getByRole('dialog', { name: 'Clean the dishwasher filter' });
  await expect(sheet.getByText(/Due .* in 7 days/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Mark done' }).click();
  const toast = page.getByText(/Done · next one/);
  await expect(toast).toBeVisible();
  await expect(sheet.getByText(/in 30 days|in 31 days|in 29 days|in 28 days/)).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(sheet.getByText(/Due .* in 7 days/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).click();
});

test('a quick win shows up in Focus under the 5-minute filter', async () => {
  const page = ownerPage;
  const composer = await openComposer(page);
  await composer.getByLabel('Title').fill('Call the dentist');
  await composer.getByRole('switch', { name: 'Quick win' }).click();
  await composer.getByRole('button', { name: '5 min', exact: true }).click();
  await composer.getByRole('button', { name: 'Today', exact: true }).click();
  await composer.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText('Added')).toBeVisible();

  await page.getByRole('link', { name: 'Focus' }).first().click();
  await page.getByRole('button', { name: '5 min', exact: true }).click();
  await expect(page.getByText('Call the dentist')).toBeVisible();
  await expect(page.getByText('Clean the dryer exhaust vent')).toHaveCount(0);
});

test('a partner joins with an invite link and receives an assigned task', async ({ browser }) => {
  const page = ownerPage;
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Invite your partner' }).click();
  const link = await page.getByLabel('Invite link').inputValue();
  expect(link).toContain('/join/');

  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  await partner.goto(new URL(link).pathname);
  await expect(partner.getByRole('heading', { name: /Join Our home/ })).toBeVisible();
  await partner.getByLabel('Your name').fill(PARTNER.name);
  await partner.getByLabel('Email').fill(PARTNER.email);
  await partner.getByLabel('Password').fill(PARTNER.password);
  await partner.getByRole('button', { name: 'Join the household' }).click();
  await expect(partner.getByRole('heading', { name: /Sam/ })).toBeVisible();

  // The owner hands a chore to the partner.
  await page.reload();
  const composer = await openComposer(page);
  await composer.getByLabel('Title').fill('Pick up the dry cleaning');
  await composer.getByRole('button', { name: 'Sam', exact: true }).click();
  await composer.getByRole('button', { name: 'Assign to Sam' }).click();
  await expect(page.getByText('Sent to Sam')).toBeVisible();

  await partner.goto('/tasks?list=mine');
  await expect(partner.getByText('Pick up the dry cleaning')).toBeVisible();
  await expect(partner.getByText('from Ghazi')).toBeVisible();
  await partnerContext.close();
});

test('private to-dos stay private', async ({ browser }) => {
  const page = ownerPage;
  const composer = await openComposer(page);
  await composer.getByLabel('Title').fill('Plan the surprise party');
  await composer.getByRole('tab', { name: 'Private' }).click();
  await composer.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText('Added')).toBeVisible();

  const partnerContext = await browser.newContext();
  const partner = await partnerContext.newPage();
  await partner.goto('/');
  await partner.getByLabel('Email').fill(PARTNER.email);
  await partner.getByLabel('Password').fill(PARTNER.password);
  await partner.getByRole('button', { name: 'Sign in' }).click();
  await expect(partner.getByRole('heading', { name: /Sam/ })).toBeVisible();
  for (const list of ['mine', 'household']) {
    await partner.goto(`/tasks?list=${list}`);
    await expect(partner.getByRole('heading', { name: 'Tasks' })).toBeVisible();
    await expect(partner.getByText('Plan the surprise party')).toHaveCount(0);
  }
  await partnerContext.close();

  await page.goto('/tasks?list=mine');
  await expect(page.getByText('Plan the surprise party')).toBeVisible();
});
