import { defineConfig } from "@playwright/test";
const staticMode = process.env.DEMO_STATIC === "1";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "demo.spec.ts",
  timeout: 90000,
  workers: 1,
  reporter: "list",
  outputDir: staticMode ? "test-results/demo-static" : "test-results/demo-dev",
  use: {
    channel: process.env.E2E_CHANNEL || "chrome",
    viewport: { width: 1366, height: 768 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `DEMO_NODE_DELAY_MS=30 DEMO_DATA_DIR=.local/builder-e2e node scripts/demo-run.mjs${staticMode ? " --static" : ""}`,
      url: "http://localhost:5506",
      timeout: 120000,
      reuseExistingServer: process.env.DEMO_REUSE === "1",
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    ...[5500, 5501, 5502, 5503, 5504, 5507].map((port) => ({
      command: `node scripts/demo-wait.mjs ${port}`,
      url: `http://localhost:${port}${port === 5507 ? "/api/health" : ""}`,
      timeout: 120000,
      reuseExistingServer: true,
    })),
  ],
});
