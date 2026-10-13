import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/monitor",
  testMatch: "community-monitor.spec.ts",
  timeout: 60000,
  workers: 1,
  use: {
    channel: process.env.E2E_CHANNEL || "chrome",
    viewport: { width: 1366, height: 768 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev:ops",
    url: "http://localhost:5401",
    reuseExistingServer: true,
  },
});
