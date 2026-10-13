import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 30000,
  workers: 1,
  use: {
    channel: 'chromium', baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1280, height: 1000 },
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev:ui', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI,
  },
});
