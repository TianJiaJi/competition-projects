import { defineConfig } from "@playwright/test";
const port = Number(process.env.GATE_E2E_PORT ?? 5197);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("GATE_E2E_PORT 无效");
export default defineConfig({
  testDir: "./apps/gate/tests/e2e",
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 390, height: 844 },
    channel: process.env.GATE_E2E_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm --filter @scenic/gate exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
