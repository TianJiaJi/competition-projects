import { defineConfig } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
mkdirSync(".local", { recursive: true });
const database = mkdtempSync(".local/mobile-e2e-") + "/qa.sqlite";
export default defineConfig({
  testDir: "tests/mobile",
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:15176",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --filter @scenic/mobile exec uni --host 127.0.0.1 --port 15176",
      env: { MOBILE_API_TARGET: "http://127.0.0.1:18787" },
      url: "http://127.0.0.1:15176",
      reuseExistingServer: false,
    },
    {
      command: "node apps/server/scripts/serve-test.ts",
      env: {
        PORT: "18787",
        DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://aiden@127.0.0.1/scenic_test',
        ALLOWED_ORIGINS: "http://127.0.0.1:15176",
      },
      url: "http://127.0.0.1:18787/api/v1/health",
      reuseExistingServer: false,
    },
  ],
});
