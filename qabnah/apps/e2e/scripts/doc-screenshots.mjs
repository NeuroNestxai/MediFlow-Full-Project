// Regenerates docs/screenshots/*.png from a running, freshly seeded stack.
//   QABNAH_API_URL=http://localhost:4100/v1 QABNAH_MERCHANT_URL=http://localhost:5273 QABNAH_ADMIN_URL=http://localhost:5274 \
//   node apps/e2e/scripts/doc-screenshots.mjs [outDir]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const API = (process.env.QABNAH_API_URL ?? 'http://localhost:4000/v1').replace(/\/+$/, '');
const M = process.env.QABNAH_MERCHANT_URL ?? 'http://localhost:5173';
const A = process.env.QABNAH_ADMIN_URL ?? 'http://localhost:5174';
const OUT = path.resolve(process.argv[2] ?? new URL('../../../docs/screenshots/', import.meta.url).pathname);
const PASSWORD = 'Qabnah-Dev-2026!';
const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
fs.mkdirSync(OUT, { recursive: true });

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const callOnce = async (method, p, token, body) => j(await fetch(`${API}${p}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : method === 'GET' ? undefined : '{}' }));
// /auth/* allows 10 requests a minute — wait and retry instead of failing half-way through.
const call = async (...args) => { for (let i = 0; ; i++) { const r = await callOnce(...args); if (r?.error?.code !== 'rate_limited' || i >= 6) return r; await new Promise((res) => setTimeout(res, 15000)); } };
const login = async (email) => (await call('POST', '/auth/login', null, { email, password: PASSWORD })).accessToken;
const shot = async (page, name, opts = {}) => {
  await page.waitForTimeout(opts.wait ?? 700);
  if (opts.full) {
    // Lazy images below the fold only load once scrolled near — walk the page first.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await page.waitForTimeout(500);
  }
  if (opts.full && opts.tall) {
    // Desktop portals: grow the viewport instead of stitching, so the sticky sidebar spans the whole shot.
    const size = page.viewportSize();
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: size.width, height: Math.min(h, 4000) });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, name) });
    await page.setViewportSize(size);
  } else {
    await page.screenshot({ path: path.join(OUT, name), fullPage: !!opts.full });
  }
  console.log('saved', name);
};

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

// ───────── Prepare real data through the API (stores open, a couple of payment links) ─────────
const owner = await login('owner@qahwa-house.qabnah.test');
const admin = await login('admin@qabnah.test');
const me = await call('GET', '/me', owner);
const mid = me.merchants[0].id;
await call('PATCH', `/merchants/${mid}`, owner, { isOpen: true, openingHours: [] });
const saffron = await login('owner@saffron-grill.qabnah.test');
const smid = (await call('GET', '/me', saffron)).merchants[0].id;
await call('PATCH', `/merchants/${smid}`, saffron, { isOpen: true, openingHours: [] });
await call('POST', `/merchants/${smid}/payment-links`, saffron, { title: 'وليمة عائلية — طلب خاص', amountBaisa: 18500, requestDelivery: false });
await call('POST', `/merchants/${smid}/payment-links`, saffron, { title: 'طلب مشاوي عبر إنستغرام', amountBaisa: 7200, requestDelivery: false });

// ───────── Storefront (Arabic, phone) ─────────
{
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(`${M}/stores`); await page.waitForSelector('[data-testid=store-card]'); await shot(page, '00-stores-directory-phone.png', { wait: 1500 });
  await page.goto(`${M}/s/saffron-grill`); await page.waitForSelector('[data-testid=product-card]'); await shot(page, '02-storefront-saffron-phone.png', { wait: 1500 });
  await page.goto(`${M}/s/qahwa-house`); await page.waitForSelector('[data-testid=product-card]'); await shot(page, '01-storefront-phone.png', { wait: 1500 });
  await page.locator('[data-testid=product-card]').first().click(); await page.waitForSelector('[data-testid=add-to-cart]'); await shot(page, '07-product-sheet-phone.png', { wait: 900 });
  await page.click('[data-testid=add-to-cart]');
  await page.locator('[data-testid=product-card]').nth(2).click(); await page.click('[data-testid=add-to-cart]');
  await page.click('[data-testid=cart-button]'); await shot(page, '08-cart-phone.png', { wait: 900 });
  await page.locator('.sf-sheet .btn--primary').click();
  await page.waitForURL(/checkout$/);
  await page.locator('input[type=tel]').first().fill('90000001');
  await page.locator('form button[type=submit]').first().click();
  const code = (await page.getByTestId('dev-code').textContent()).trim();
  await page.locator('input[autocomplete="one-time-code"]').fill(code);
  await page.locator('form button[type=submit]').first().click();
  await page.waitForSelector('[data-testid=quote-breakdown]', { timeout: 15000 });
  await shot(page, '09-checkout-phone.png', { wait: 900, full: true });
  await page.click('[data-testid=place-order]');
  await page.waitForURL(/\/orders\//);
  const orderId = page.url().split('/orders/')[1].split('?')[0];
  // Merchant accepts, ops assigns the nearest captain → the tracking page shows captain + map.
  await call('POST', `/merchants/${mid}/orders/${orderId}/accept`, owner, { prepTimeMinutes: 10 });
  const live = await call('GET', '/admin/operations/live', admin);
  const delivery = live.deliveries.find((d) => d.orderId === orderId);
  const captain = live.captains.find((c) => /Ahmed/.test(c.fullName)) ?? live.captains[0];
  if (delivery && captain) await call('POST', `/admin/deliveries/${delivery.id}/assign`, admin, { captainId: captain.id });
  // Two more real orders at Saffron Grill from the same signed-in customer, so the merchant board shows several stages.
  const consumer = JSON.parse(await page.evaluate(() => localStorage.getItem('qabnah.consumer.session'))).accessToken;
  const addressId = (await call('GET', '/me/addresses', consumer)).items[0].id;
  const menu = (await call('GET', '/stores/saffron-grill')).categories.flatMap((cat) => cat.products);
  const line = (name, quantity) => { const pr = menu.find((x) => x.nameEn === name); return { productId: pr.id, quantity, optionIds: (pr.optionGroups ?? []).filter((g) => g.minSelect > 0).map((g) => g.options[0].id) }; };
  const place = async (items, paymentMethod) => call('POST', '/orders', consumer, { merchantId: smid, addressId, paymentMethod, source: 'storefront', items });
  const o1 = await place([line('Mixed Grill Platter', 1), line('Fresh Lemon Mint', 2)], 'cod');
  const o2 = await place([line('Chicken Shawarma', 3), line('Laban', 3)], 'cod');
  if (o1?.id) await call('POST', `/merchants/${smid}/orders/${o1.id}/accept`, saffron, { prepTimeMinutes: 20 });
  if (o2?.id) { await call('POST', `/merchants/${smid}/orders/${o2.id}/accept`, saffron, { prepTimeMinutes: 15 }); await call('POST', `/merchants/${smid}/orders/${o2.id}/preparing`, saffron); }
  await page.reload(); await page.waitForSelector('.track');
  await shot(page, '03-order-tracking-phone.png', { wait: 1800, full: true });
  const state = await ctx.storageState();
  const dctx = await browser.newContext({ ...desktop, storageState: state });
  const dpage = await dctx.newPage();
  await dpage.goto(page.url()); await dpage.waitForSelector('.track'); await shot(dpage, '04-order-tracking-desktop.png', { wait: 1800 });
  await dctx.close();
  // Payment link
  const ward = await login('owner@ward-flowers.qabnah.test');
  const wmid = (await call('GET', '/me', ward)).merchants[0].id;
  const link = await call('POST', `/merchants/${wmid}/payment-links`, ward, { title: 'باقة ورد أحمر', amountBaisa: 12500, requestDelivery: false });
  await page.goto(`${M}/pay/${link.code}`); await page.waitForSelector('.receipt'); await shot(page, '05-payment-link-phone.png', { wait: 1200, full: true });
  await ctx.close();
}

// ───────── Merchant portal (Arabic, desktop) ─────────
{
  const ctx = await browser.newContext(desktop);
  const page = await ctx.newPage();
  await page.goto(`${M}/login`);
  await shot(page, '32-merchant-login.png', { wait: 1200 });
  await page.fill('input[type=email]', 'owner@saffron-grill.qabnah.test');
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/orders$/);
  await page.waitForSelector('[data-testid=order-card]', { timeout: 10000 }).catch(() => undefined);
  await shot(page, '10-merchant-orders-board.png', { wait: 1500 });
  if (await page.locator('[data-testid=order-card] .order-card__main').count()) {
    await page.locator('[data-testid=order-card] .order-card__main').first().click();
    await shot(page, '11-merchant-order-drawer.png', { wait: 1500 });
  }
  await page.goto(`${M}/catalog`); await page.waitForSelector('[data-testid=catalog-card]'); await shot(page, '12-merchant-catalog.png', { wait: 1200 });
  await page.locator('[data-testid=catalog-card] a').first().click(); await page.waitForSelector('.editor-layout'); await shot(page, '13-merchant-product-variants.png', { wait: 1200, full: true, tall: true });
  await page.goto(`${M}/store?tab=branding`); await page.waitForSelector('.phone'); await shot(page, '14-merchant-branding.png', { wait: 1500 });
  await page.goto(`${M}/deliveries/new`); await shot(page, '15-merchant-book-delivery.png', { wait: 1500 });
  await page.goto(`${M}/payment-links`); await shot(page, '16-merchant-payment-links.png', { wait: 1200 });
  await page.goto(`${M}/whatsapp`); await shot(page, '17-merchant-whatsapp.png', { wait: 1200 });
  await page.goto(`${M}/finance`); await shot(page, '18-merchant-finance.png', { wait: 1200 });
  await page.goto(`${M}/analytics`); await shot(page, '19-merchant-analytics.png', { wait: 1500 });
  await ctx.close();
}

// ───────── Admin (English, desktop) ─────────
{
  const ctx = await browser.newContext(desktop);
  const page = await ctx.newPage();
  await page.goto(`${A}/login`);
  await page.fill('input[type=email]', 'admin@qabnah.test');
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/ops$/); await page.waitForSelector('[data-testid=ops-captains] li'); await shot(page, '20-admin-live-ops.png', { wait: 2000 });
  await page.goto(`${A}/captains`); await page.waitForSelector('tbody tr'); await shot(page, '21-admin-captains.png', { wait: 1000 });
  const pending = (await call('GET', '/admin/captains?status=pending_review', admin)).items?.[0];
  if (pending) { await page.goto(`${A}/captains/${pending.id}`); await shot(page, '22-admin-captain-review.png', { wait: 1800, full: true, tall: true }); }
  await page.goto(`${A}/merchants`); await page.waitForSelector('tbody tr'); await shot(page, '23-admin-merchants.png', { wait: 1000 });
  await page.goto(`${A}/orders`); await page.waitForSelector('tbody tr'); await shot(page, '24-admin-orders.png', { wait: 1000 });
  await page.goto(`${A}/config/pricing`); await shot(page, '25-admin-pricing.png', { wait: 1500 });
  await page.goto(`${A}/config/dispatch`); await shot(page, '26-admin-dispatch-rules.png', { wait: 1500 });
  await page.goto(`${A}/finance`); await page.getByRole('tab', { name: 'Balances' }).click().catch(() => undefined); await shot(page, '27-admin-finance.png', { wait: 1500 });
  await page.goto(`${A}/analytics`); await shot(page, '28-admin-analytics.png', { wait: 1800 });
  await page.goto(`${A}/support`); await shot(page, '29-admin-support.png', { wait: 1500 });
  await page.goto(`${A}/staff`); await shot(page, '30-admin-staff-roles.png', { wait: 1500 });
  await page.goto(`${A}/security`); await page.getByRole('button', { name: /Set up two-factor/ }).click().catch(() => undefined); await page.waitForSelector('.mfa-qr, [data-testid=mfa-qr], canvas, img[alt*=QR]', { timeout: 8000 }).catch(() => undefined); await shot(page, '31-admin-2fa.png', { wait: 1500 });
  await ctx.close();
}
await browser.close();
console.log('done →', OUT);
