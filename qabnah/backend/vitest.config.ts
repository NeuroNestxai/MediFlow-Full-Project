import { defineConfig } from 'vitest/config';

const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/qabnah_test';

export default defineConfig({
  test: {
    globalSetup: ['./test/helpers/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DB,
      OTP_DEV_ECHO: 'true',
      PAYMENT_PROVIDER: 'mock',
      LOG_LEVEL: 'silent',
      STORAGE_DIR: './storage-test',
      WHATSAPP_APP_SECRET: 'test-app-secret',
      WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    include: ['test/**/*.test.ts'],
  },
});
