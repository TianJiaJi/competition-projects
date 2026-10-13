import { defineConfig } from "@playwright/test";
import { scenario } from "./scenario/config";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  workers: 1,
  reporter: "list",
  use: {
    channel: process.env.E2E_CHANNEL || "chrome",
    viewport: { width: 1366, height: 768 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm dev",
      url: `http://localhost:${scenario.ports.public}`,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm dev:ui",
      url: `http://localhost:${scenario.ports.preview}`,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
