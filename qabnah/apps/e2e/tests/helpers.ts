import { expect, type APIRequestContext } from '@playwright/test';

export const API = (process.env.QABNAH_API_URL ?? 'http://localhost:4000/v1').replace(/\/+$/, '');
export const MERCHANT = process.env.QABNAH_MERCHANT_URL ?? 'http://localhost:5173';
export const ADMIN = process.env.QABNAH_ADMIN_URL ?? 'http://localhost:5174';
export const PASSWORD = 'Qabnah-Dev-2026!';
export const SHOTS = new URL('../screenshots/', import.meta.url).pathname;

export async function login(request: APIRequestContext, email: string) {
  const r = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(r.ok(), `login ${email}: ${r.status()}`).toBeTruthy();
  return (await r.json()) as { accessToken: string; refreshToken: string };
}

export async function otpLogin(request: APIRequestContext, phone: string) {
  const req = await request.post(`${API}/auth/otp/request`, { data: { phone } });
  expect(req.ok(), `otp request ${req.status()} ${await req.text()}`).toBeTruthy();
  const { devCode } = await req.json();
  expect(devCode, 'API must run with OTP_DEV_ECHO=true').toBeTruthy();
  const v = await request.post(`${API}/auth/otp/verify`, { data: { phone, code: devCode } });
  expect(v.ok()).toBeTruthy();
  return (await v.json()) as { accessToken: string };
}

export const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** Open the store regardless of time of day (store toggle on, no fixed hours). */
export async function openStore(request: APIRequestContext, ownerToken: string, slug: string) {
  const me = await (await request.get(`${API}/me`, { headers: auth(ownerToken) })).json();
  const m = me.merchants.find((x: { slug: string }) => x.slug === slug);
  const r = await request.patch(`${API}/merchants/${m.id}`, { headers: auth(ownerToken), data: { isOpen: true, openingHours: [] } });
  expect(r.ok(), `open store ${r.status()}`).toBeTruthy();
  return m.id as string;
}
