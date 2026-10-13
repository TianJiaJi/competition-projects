import { defineConfig } from "@playwright/test";

/**
 * 后台浏览器测试：默认使用本机已安装的 Chrome（channel: chrome），
 * 避免在受限网络下必须下载 Playwright 自带 Chromium。
 * 需要指定具体浏览器时设置 ADMIN_E2E_EXECUTABLE=/path/to/chrome，
 * 需要 Playwright 自带构建时设置 ADMIN_E2E_CHANNEL=chromium（需先 npx playwright install chromium）。
 */
const executablePath = process.env.ADMIN_E2E_EXECUTABLE;
const channel = process.env.ADMIN_E2E_CHANNEL ?? "chrome";
const port = Number(process.env.ADMIN_E2E_PORT ?? 5176);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("ADMIN_E2E_PORT 必须是 1—65535 的整数");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./apps/admin/tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : { channel }),
  },
  webServer: {
    command: `pnpm --filter @scenic/admin exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    // 必须测试当前工作区的代码，避免复用另一个工作区的预览。
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
