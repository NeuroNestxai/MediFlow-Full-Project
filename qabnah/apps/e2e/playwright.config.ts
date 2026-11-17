import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

/**
 * Smoke tests against a running, seeded API and the two web apps.
 * Env: QABNAH_API_URL (default http://localhost:4000/v1), QABNAH_MERCHANT_URL (default http://localhost:5173),
 * QABNAH_ADMIN_URL (default http://localhost:5174), QABNAH_SITE_URL (default http://localhost:5175). Vite dev servers are started on those ports (pointed at
 * QABNAH_API_URL) unless something already listens there.
 */
const chromiumPath = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
const API = process.env.QABNAH_API_URL ?? 'http://localhost:4000/v1';
const MERCHANT = process.env.QABNAH_MERCHANT_URL ?? 'http://localhost:5173';
const ADMIN = process.env.QABNAH_ADMIN_URL ?? 'http://localhost:5174';
const SITE = process.env.QABNAH_SITE_URL ?? 'http://localhost:5175';
const port = (u: string) => new URL(u).port || '80';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'off',
    screenshot: 'only-on-failure',
    viewport: { width: 1366, height: 860 },
    deviceScaleFactor: 1,
    ...(process.env.PW_CHROMIUM_PATH || chromiumPath ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH ?? chromiumPath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1 } }],
  webServer: [
    { command: `npx vite --port ${port(MERCHANT)} --strictPort`, cwd: '../merchant', url: MERCHANT, reuseExistingServer: true, timeout: 60_000, env: { VITE_API_URL: API } },
    { command: `npx vite --port ${port(ADMIN)} --strictPort`, cwd: '../admin', url: ADMIN, reuseExistingServer: true, timeout: 60_000, env: { VITE_API_URL: API } },
    { command: `npx vite --port ${port(SITE)} --strictPort`, cwd: '../site', url: SITE, reuseExistingServer: true, timeout: 60_000, env: { VITE_API_URL: API, VITE_MERCHANT_URL: MERCHANT } },
  ],
});
