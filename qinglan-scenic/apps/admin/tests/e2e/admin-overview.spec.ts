import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

declare global {
  interface Window {
    __overviewTest?: { reports?: "fail" | "throw" | "empty" | "many"; metrics?: "fail" | "throw" | "empty"; delay?: number };
  }
}

/** 只在浏览器测试中替换服务导出；生产代码不含故障注入开关。 */
async function interceptOverview(page: Page): Promise<void> {
  for (const [module, method, key] of [["chat", "listReports", "reports"], ["orders", "getOverview", "metrics"]]) {
    await page.route(new RegExp(`/src/services/${module}\\.ts$`), route => route.fulfill({
      contentType: "application/javascript",
      body: `
        import { ${method} as actual } from '/src/services/${module}.ts?overview-test-original';
        export * from '/src/services/${module}.ts?overview-test-original';
        export async function ${method}(...args) {
          const state = window.__overviewTest ?? {};
          await new Promise(resolve => setTimeout(resolve, state.delay ?? 0));
          if (state.${key} === 'throw') throw new Error('读取异常');
          if (state.${key} === 'fail') return { ok: false, error: { code: 'MOCK_STORAGE_FAILED', message: '测试读取失败' } };
          const result = await actual(...args);
          if (!result.ok) return result;
          if (state.${key} === 'empty') return { ok: true, data: ${key === "reports" ? "{ ...result.data, items: [], total: 0 }" : "{ ...result.data, latestAlerts: [], pendingAlertCount: 0 }"} };
          ${key === "reports" ? `if (state.reports === 'many') return { ok: true, data: { ...result.data, total: 5, items: Array.from({length: 5}, (_, i) => ({ ...result.data.items[0], id: 'test-' + i, roomName: '举报房间 ' + (i + 1) })) } };` : ""}
          return result;
        }`,
    }));
  }
}

test("刷新保留旧数据，概况与举报失败可分别重试", async ({ page }) => {
  await interceptOverview(page);
  await login(page);
  const admission = page.getByRole("button", { name: /当日有效入园预约人数/ });
  const reports = page.getByRole("region", { name: "待处理举报", exact: true });
  await expect(admission).toContainText("406");
  await expect(reports.locator(".overview__reports li")).toHaveCount(1);
  await page.evaluate(() => { window.__overviewTest = { metrics: "fail", reports: "throw", delay: 500 }; });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.getByRole("button", { name: "刷新中", exact: true })).toBeDisabled();
  await expect(admission).toContainText("406");
  await expect(reports.locator(".overview__reports li")).toHaveCount(1);
  await expect(page.getByText("刷新失败，当前展示上次读取的数据。", { exact: true })).toBeVisible();
  await expect(reports.getByRole("alert")).toContainText("举报刷新失败");
  await page.evaluate(() => { window.__overviewTest = { metrics: "fail" }; });
  await reports.getByRole("button", { name: "重试举报" }).click();
  await expect(reports.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("刷新失败，当前展示上次读取的数据。", { exact: true })).toBeVisible();
  await page.evaluate(() => { window.__overviewTest = {}; });
  await page.getByRole("button", { name: "重新读取" }).click();
  await expect(page.getByRole("button", { name: "刷新", exact: true })).toBeEnabled();
  await expect(page.locator(".overview").getByRole("alert")).toHaveCount(0);
});

test("举报首次读取失败不显示假空态，摘要限一条且保留总数", async ({ page }) => {
  await interceptOverview(page);
  await page.addInitScript(() => { window.__overviewTest = { reports: "fail" }; });
  await login(page);
  const reports = page.getByRole("region", { name: "待处理举报", exact: true });
  await expect(reports.getByRole("alert")).toContainText("举报读取失败");
  await expect(reports.getByText("当前没有待处理举报。")).toHaveCount(0);
  await expect(reports.getByRole("button", { name: "待处理举报", exact: true })).toContainText("1");
  await page.evaluate(() => { window.__overviewTest = { reports: "many" }; });
  await reports.getByRole("button", { name: "重试举报" }).click();
  await expect(reports.locator(".overview__reports li")).toHaveCount(1);
  await expect(reports.getByRole("button", { name: "待处理举报", exact: true })).toContainText("5");
  await page.evaluate(() => { window.__overviewTest = { reports: "empty", metrics: "empty" }; });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(reports.getByText("当前没有待处理举报。")).toBeVisible();
  await expect(page.getByText("当前没有未完成告警。")).toBeVisible();
});

test("首次概况异常显示错误，重试后恢复告警工作台", async ({ page }) => {
  await interceptOverview(page);
  await page.addInitScript(() => { window.__overviewTest = { metrics: "throw" }; });
  await login(page);
  await expect(page.locator(".overview").getByRole("alert")).toContainText("读取失败");
  await expect(page.locator(".overview__number")).toHaveCount(0);
  await page.evaluate(() => { window.__overviewTest = {}; });
  await page.locator(".overview").getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByRole("heading", { name: "优先关注的告警" })).toBeVisible();
  await expect(page.getByRole("button", { name: /未完成告警/ })).toContainText("8");
});

test("告警占据主区域，公共玻璃与大字号在桌面和窄容器下可读", async ({ page }) => {
  await login(page);
  await expect(page.locator(".overview__alerts li")).toHaveCount(5);
  for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080], [1200, 900]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".admin-record-rack .rr-title-record")).toHaveCSS("top", "4px");
    await expect(page.locator(".admin-record-rack .rr-record").last()).toHaveCSS("top", `${height - 264}px`);
    await expect(page.locator("body")).toHaveCSS("font-size", "18px");
    const primary = await page.locator(".overview__task--primary").boundingBox();
    const side = await page.locator(".overview__side").boundingBox();
    expect(primary).not.toBeNull(); expect(side).not.toBeNull();
    if (width >= 1366) {
      expect(primary!.width).toBeGreaterThan(side!.width * 1.8);
      expect(primary!.y).toBeCloseTo(side!.y);
    } else expect(side!.y).toBeGreaterThan(primary!.y + primary!.height);
    await expect(page.locator(".overview__task--primary")).toHaveAttribute("data-glass-mode", "css");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.locator(".overview__notes")).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "未完成告警（待处理 + 处理中）", exact: true }).click();
  await expect(page.getByRole("heading", { name: "告警记录" })).toBeVisible();
  await expect(page).toHaveURL(/alerts\?scope=current/);
});

test("首屏容纳关键信息，说明浮层不撑开页面，刷新使用单个玻璃按钮", async ({ page }) => {
  await login(page);
  await expect(page.locator(".overview__alerts li")).toHaveCount(5);
  for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const before = await page.locator(".overview__task--primary").boundingBox();
  const summary = page.locator(".overview__notes summary");
  await summary.click();
  const notes = page.getByRole("region", { name: "数据说明", exact: true });
  await expect(notes).toHaveAttribute("data-glass-mode", "css");
  await expect(notes).toHaveCSS("backdrop-filter", "blur(8px) saturate(1.12)");
  expect(await page.locator(".overview__task--primary").boundingBox()).toEqual(before);
  await summary.press("Escape");
  await expect(notes).not.toBeVisible();
  await expect(summary).toBeFocused();
  await summary.click();
  await page.getByRole("heading", { name: "工作台", exact: true }).click();
  await expect(notes).not.toBeVisible();
  await expect(page.getByRole("button", { name: "刷新", exact: true })).toHaveCSS("min-height", "48px");
  await expect(page.getByRole("button", { name: "刷新", exact: true })).toHaveAttribute("data-glass-mode", "css");
  await expect(page.locator(".rr-title")).toHaveCSS("font-family", /Songti SC/);
  expect(await page.locator("body").innerText()).not.toMatch(/演示|mock|模拟|样例|原型/i);
});
