import { expect, test } from '@playwright/test';
import { API, MERCHANT, PASSWORD, SHOTS, auth, login, openStore, otpLogin } from './helpers';

test('merchant owner signs in, sees the placed order on the live board and accepts it', async ({ page, request }) => {
  const owner = await login(request, 'owner@saffron-grill.qabnah.test');
  const merchantId = await openStore(request, owner.accessToken, 'saffron-grill');
  // The seed creates one "placed" order; the worker auto-cancels it after the accept timeout, so create one if it expired.
  let active = await (await request.get(`${API}/merchants/${merchantId}/orders?status=placed`, { headers: auth(owner.accessToken) })).json();
  if (!active.items.length) {
    const consumer = await otpLogin(request, '+96890000002');
    const store = await (await request.get(`${API}/stores/saffron-grill`)).json();
    const laban = [...store.categories.flatMap((c: { products: unknown[] }) => c.products), ...store.uncategorized].find((p: { nameEn: string }) => p.nameEn === 'Laban');
    const r = await request.post(`${API}/orders`, {
      headers: { ...auth(consumer.accessToken), 'idempotency-key': `e2e-${Date.now()}` },
      data: { merchantId, items: [{ productId: laban.id, quantity: 2 }], dropoff: { location: { lat: 23.6105, lng: 58.4802 }, address: 'Qurum, e2e villa' }, paymentMethod: 'cod' },
    });
    expect(r.status(), await r.text()).toBe(201);
    active = await (await request.get(`${API}/merchants/${merchantId}/orders?status=placed`, { headers: auth(owner.accessToken) })).json();
  }
  const placed = active.items[0];
  expect(placed.status).toBe('placed');

  await page.goto(`${MERCHANT}/login`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByLabel(/البريد الإلكتروني/).fill('owner@saffron-grill.qabnah.test');
  await page.getByLabel(/كلمة المرور/).fill(PASSWORD);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).toHaveURL(/\/orders$/);

  const column = page.locator('[data-column="placed"]');
  const card = column.locator('[data-testid="order-card"]', { hasText: placed.number });
  await expect(card).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}merchant-orders-board-rtl.png` });

  await card.getByRole('button', { name: 'قبول' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'قبول' }).click();

  await expect(page.locator('[data-column="accepted"] [data-testid="order-card"]', { hasText: placed.number })).toBeVisible();
  const after = await (await request.get(`${API}/merchants/${merchantId}/orders/${placed.id}`, { headers: auth(owner.accessToken) })).json();
  expect(after.status).toBe('accepted');
});
