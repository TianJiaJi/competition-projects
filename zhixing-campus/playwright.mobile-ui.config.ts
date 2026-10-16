import { defineConfig } from '@playwright/test';
process.env.E2E_MOBILE_PORT = '15512';
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'assistant.spec.ts',
  outputDir: '.local/qa/mobile-ui-results',
  timeout: 60000,
  workers: 1,
  reporter: 'list',
  use: { channel: process.env.E2E_CHANNEL || 'chrome', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm --filter @scene/mobile exec uni --host localhost --port 15512',
    url: 'http://localhost:15512',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
