import { expect, test } from '@playwright/test';

const SITE = process.env.QABNAH_SITE_URL ?? 'http://localhost:5175';

test('marketing site: Arabic first, stores and zones from the API, English toggle, pre-rendered scene frames', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // "?stills" forces the pre-rendered frames of the 3D scene (what phones get), so the test does not depend on WebGL.
  await page.goto(`${SITE}/?stills`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('وقبناه لك');
  await expect(page.locator('#stills img')).toHaveCount(4);

  // Live data: the seeded active stores and the service zones.
  const stores = page.locator('#store-list a.store');
  await expect(stores.first()).toBeVisible();
  expect(await stores.count()).toBeGreaterThanOrEqual(3);
  await expect(stores.first()).toHaveAttribute('href', /\/s\/[a-z0-9-]+$/);
  await expect(page.locator('#zone-list li').first()).toBeVisible();

  // Scrolling through the stage moves to the last chapter.
  await page.evaluate(() => { const s = document.querySelector<HTMLElement>('#stage')!; window.scrollTo(0, s.offsetHeight - window.innerHeight); });
  await expect(page.locator('.chapter[data-chapter="3"]')).toHaveClass(/is-on/);
  await expect(page.locator('#rail li').nth(3)).toHaveClass(/is-on/);

  // English is a separate complete text; links carry the language to the web app.
  await page.locator('#lang').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('.chapter-hero h1')).toContainText('We bring it');
  await expect(stores.first()).toHaveAttribute('href', /\?lang=en$/);
  await expect(page.locator('[data-link="register"]').first()).toHaveAttribute('href', /\/register\?lang=en$/);

  expect(errors).toEqual([]);
});
