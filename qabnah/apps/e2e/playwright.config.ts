import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

/**
 * Smoke tests against a running API (default http://localhost:4100/v1, seeded) and the two web apps.
 * The Vite dev servers are started automatically unless they are already running.
 */
const chromiumPath = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
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
    { command: 'npm run dev -w @qabnah/merchant', cwd: '..', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run dev -w @qabnah/admin', cwd: '..', url: 'http://localhost:5174', reuseExistingServer: true, timeout: 60_000 },
  ],
});
