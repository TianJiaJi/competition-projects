import { defineConfig } from "@playwright/test";

/**
 * 后台浏览器测试：默认使用本机已安装的 Chrome（channel: chrome），
 * 避免在受限网络下必须下载 Playwright 自带 Chromium。
 * 需要指定具体浏览器时设置 ADMIN_E2E_EXECUTABLE=/path/to/chrome，
 * 需要 Playwright 自带构建时设置 ADMIN_E2E_CHANNEL=chromium（需先 npx playwright install chromium）。
 */
const executablePath = process.env.ADMIN_E2E_EXECUTABLE;
const channel = process.env.ADMIN_E2E_CHANNEL ?? "chrome";

export default defineConfig({
  testDir: "./apps/admin/tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:5176",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : { channel }),
  },
  webServer: {
    command: "pnpm dev:admin",
    url: "http://localhost:5176",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
