import { expect, test } from '@playwright/test';
import { ADMIN, API, auth, login, totp } from './helpers';

test('admin with two-factor authentication signs in through the code step and sees live ops', async ({ page, request }) => {
  // A fresh ops manager so the shared seeded admin account is left without MFA.
  const admin = await login(request, 'admin@qabnah.test');
  const email = `mfa.e2e.${Date.now()}@qabnah.test`;
  const created = await request.post(`${API}/admin/staff`, { headers: auth(admin.accessToken), data: { email, fullName: 'MFA E2E Ops', roleKeys: ['ops_manager'] } });
  expect(created.status(), await created.text()).toBe(201);
  const { temporaryPassword } = await created.json();

  // Enrol via the API with a TOTP computed here (RFC 6238).
  const first = await (await request.post(`${API}/auth/login`, { data: { email, password: temporaryPassword } })).json();
  const setup = await request.post(`${API}/auth/mfa/setup`, { headers: auth(first.accessToken) });
  expect(setup.ok(), await setup.text()).toBeTruthy();
  const { secret, otpauthUrl } = await setup.json();
  expect(otpauthUrl).toContain('otpauth://totp/');
  const enable = await request.post(`${API}/auth/mfa/enable`, { headers: auth(first.accessToken), data: { code: totp(secret) } });
  expect(enable.ok(), await enable.text()).toBeTruthy();
  expect((await enable.json()).recoveryCodes).toHaveLength(10);

  // Password step now returns a challenge instead of tokens.
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(temporaryPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Enter your authenticator code' })).toBeVisible();

  // A wrong code is rejected with the API message; then the next time step's code (the current one was used to enable) succeeds.
  await page.getByTestId('mfa-code').fill('000000');
  await page.getByTestId('mfa-submit').click();
  await expect(page.getByText('The authenticator code is incorrect')).toBeVisible();
  await page.getByTestId('mfa-code').fill(totp(secret, Date.now(), 1));
  await page.getByTestId('mfa-submit').click();

  await expect(page).toHaveURL(/\/ops$/);
  await expect(page.getByTestId('ops-captains').locator('li').first()).toBeVisible();
  await page.getByRole('link', { name: /Account security/ }).click();
  await expect(page.getByText('On', { exact: true })).toBeVisible();
});
