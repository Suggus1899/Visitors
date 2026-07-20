import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the LogMaster monorepo.
 *
 * One project is defined per app so you can run a single app's suite:
 *   pnpm e2e -- --project=admin
 *
 * Servers are NOT started automatically. Start the backend and the apps
 * you want to test before running E2E (see e2e/README.md).
 *
 * Base URLs default to the local dev ports and can be overridden with env
 * vars, e.g. `ADMIN_BASE_URL=http://localhost:6175 pnpm e2e -- --project=admin`.
 */
const appBaseURL = (envVar: string, fallback: string): string =>
  process.env[envVar] ?? fallback;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'landing',
      testMatch: /landing\/.*\.spec\.ts/,
      use: {
        baseURL: appBaseURL('LANDING_BASE_URL', 'http://localhost:5173'),
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'platform',
      testMatch: /platform\/.*\.spec\.ts/,
      use: {
        baseURL: appBaseURL('PLATFORM_BASE_URL', 'http://localhost:5174'),
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'admin',
      testMatch: /admin\/.*\.spec\.ts/,
      use: {
        baseURL: appBaseURL('ADMIN_BASE_URL', 'http://localhost:5175'),
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'auditor',
      testMatch: /auditor\/.*\.spec\.ts/,
      use: {
        baseURL: appBaseURL('AUDITOR_BASE_URL', 'http://localhost:5176'),
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'system',
      testMatch: /system\/.*\.spec\.ts/,
      use: {
        baseURL: appBaseURL('SYSTEM_BASE_URL', 'http://localhost:5177'),
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'cross-app',
      testMatch: /cross-app\/.*\.spec\.ts/,
      use: {
        // Cross-app tests visit each app explicitly; baseURL is not used.
        baseURL: appBaseURL('LANDING_BASE_URL', 'http://localhost:5173'),
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
