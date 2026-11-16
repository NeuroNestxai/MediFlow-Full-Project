import { expect, test } from '@playwright/test';
import { MERCHANT, SHOTS, login, openStore } from './helpers';

test('storefront: add an item with options and reach the quote step after OTP sign-in', async ({ page, request }) => {
  const owner = await login(request, 'owner@saffron-grill.qabnah.test');
  await openStore(request, owner.accessToken, 'saffron-grill');

  await page.goto(`${MERCHANT}/s/saffron-grill`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'مشويات الزعفران' })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}storefront-rtl.png` });

  await page.getByTestId('product-card').filter({ hasText: 'شاورما دجاج' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^كبير/).check();
  await dialog.getByLabel(/^جبن/).check();
  // 0.900 + 0.400 (large) + 0.200 (cheese) = 1.500
  await expect(dialog.getByTestId('unit-price')).toHaveText('١٫٥٠٠ ر.ع.');
  await dialog.getByTestId('add-to-cart').click();
  await expect(dialog).toBeHidden();

  await page.getByTestId('cart-button').click();
  await page.getByRole('button', { name: 'إتمام الطلب' }).click();
  await expect(page).toHaveURL(/\/s\/saffron-grill\/checkout$/);

  await page.getByLabel('رقم الهاتف').fill('90000001');
  await page.getByRole('button', { name: 'إرسال الرمز' }).click();
  const code = (await page.getByTestId('dev-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel('رمز التحقق').fill(code);
  await page.getByRole('button', { name: 'تحقق ومتابعة' }).click();

  const breakdown = page.getByTestId('quote-breakdown');
  await expect(breakdown).toBeVisible();
  await expect(page.getByTestId('quote-total')).toContainText('ر.ع.');
  await expect(page.getByTestId('place-order')).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}storefront-checkout-quote.png` });
});
