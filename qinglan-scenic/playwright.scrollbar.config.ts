import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  outputDir: '.local/scrollbar-qa/component',
  testDir: './tests/ui', testMatch: 'scrollbar.spec.ts', timeout: 30000, workers: 2,
  use: { baseURL: 'http://127.0.0.1:5174', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], channel: 'chromium' } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: { command: 'pnpm dev:ui', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI },
});
