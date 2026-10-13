import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ops",
  outputDir: ".local/ops-e2e/results",
  timeout: 90000,
  workers: 1,
  use: {
    channel: "chromium",
    baseURL: "http://localhost:5175",
    viewport: { width: 1920, height: 1080 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev:ops",
    url: "http://localhost:5175",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
