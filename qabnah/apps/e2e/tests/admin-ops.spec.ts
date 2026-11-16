import { expect, test } from '@playwright/test';
import { ADMIN, PASSWORD, SHOTS } from './helpers';

test('admin signs in and the live operations page shows online captains on the map', async ({ page }) => {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('Email').fill('admin@qabnah.test');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/ops$/);
  const list = page.getByTestId('ops-captains');
  await expect(list.locator('li').first()).toBeVisible();
  expect(await list.locator('li').count()).toBeGreaterThan(0);
  await expect(page.locator('.leaflet-container .captain-marker').first()).toBeVisible();
  await expect(page.getByText('Captains online').first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}admin-live-ops.png` });
});
