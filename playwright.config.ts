import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', workers: 1, retries: 0, timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: 'https://localhost:8443', ignoreHTTPSErrors: true,
    permissions: ['camera'], trace: 'off',
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  },
});
