import { defineConfig } from '@playwright/test';
const url = process.env.SUBMISSION_TEST_DATABASE_URL;
if (
  !url ||
  !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
  new URL(url).pathname !== '/spark_submission_test'
) {
  throw new Error('Set SUBMISSION_TEST_DATABASE_URL to the dedicated local spark_submission_test database.');
}
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
export default defineConfig({
  testDir: './test/browser/specs',
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:3107',
    actionTimeout: 15000,
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: 'npx next dev test/browser -H 127.0.0.1 -p 3107',
    url: 'http://127.0.0.1:3107',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: url, DIRECT_URL: url, NEXT_TELEMETRY_DISABLED: '1' },
  },
});
