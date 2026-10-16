import { defineConfig } from '@playwright/test';

// Independently await each frontend, rather than starting the suite when only
// the public screen is ready. Business data is isolated by booking-review.spec.
process.env.E2E_MOBILE_PORT = '15502';
process.env.E2E_STAFF_PORT = '15503';
process.env.E2E_ADMIN_PORT = '15504';
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: ['booking-review.spec.ts', 'approval-messages.spec.ts'],
  outputDir: '.local/qa/bookings-results',
  timeout: 90000,
  workers: 1,
  reporter: 'list',
  use: {
    channel: process.env.E2E_CHANNEL || 'chrome',
    viewport: { width: 1366, height: 768 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'pnpm --filter @scene/mobile exec uni --host localhost --port 15502', port: 15502 },
    { command: 'pnpm --filter @scene/staff exec vite --host localhost --port 15503 --strictPort', port: 15503 },
    { command: 'pnpm --filter @scene/admin exec vite --host localhost --port 15504 --strictPort', port: 15504 },
  ].map(({ command, port }) => ({ command, url: `http://localhost:${port}`, timeout: 120000, reuseExistingServer: false })),
});
