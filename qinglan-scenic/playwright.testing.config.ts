import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/testing",
  outputDir: ".local/qa/testing-results",
  timeout: 30000,
  workers: 1,
  use: {
    channel: "chromium",
    baseURL: "http://127.0.0.1:15180",
    viewport: { width: 1440, height: 1100 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @scenic/testing exec vite --host 127.0.0.1 --port 15180 --strictPort",
    url: "http://127.0.0.1:15180",
    reuseExistingServer: !process.env.CI,
  },
});
