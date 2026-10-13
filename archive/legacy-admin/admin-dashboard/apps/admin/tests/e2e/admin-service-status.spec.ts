import { expect, test, type Page } from "@playwright/test";
import { gotoPage, login } from "./helpers";

declare global {
  interface Window {
    __healthTest?: { mode?: "fail" | "throw" | "states" | "invalid" | "envelope"; delay?: number };
  }
}

// 仅测试时替换服务导出，产品中不加入场景按钮或故障开关。
async function interceptStatus(page: Page) {
  await page.route(/\/src\/services\/system\.ts$/, route => route.fulfill({
    contentType: "application/javascript",
    body: `
      import { getServiceStatus as actual } from '/src/services/system.ts?health-original';
      export * from '/src/services/system.ts?health-original';
      export async function getServiceStatus() {
        const state = window.__healthTest ?? {};
        await new Promise(resolve => setTimeout(resolve, state.delay ?? 0));
        if (state.mode === 'throw') throw new Error('test');
        if (state.mode === 'fail') return { ok: false, error: { code: 'MOCK_STORAGE_FAILED', message: '测试读取失败' } };
        const result = await actual();
        if (!result.ok) return result;
        if (state.mode === 'envelope') result.data.checkedAt = 'invalid';
        if (state.mode === 'states') {
          Object.assign(result.data.modules[0], { healthyCount: 0, abnormalCount: 8, unknownCount: 0 });
          Object.assign(result.data.modules[1], { healthyCount: 0, abnormalCount: 0, unknownCount: 0 });
          Object.assign(result.data.modules[2], { healthyCount: 0, abnormalCount: 0, unknownCount: 6 });
        }
        if (state.mode === 'invalid') {
          result.data.modules = result.data.modules.filter(row => row.id !== 'guide');
          result.data.modules.find(row => row.id === 'admin').healthyCount = -1;
        }
        return result;
      }
    `,
  }));
}

test("七环健康与异常比例准确，无来源说明或详情入口", async ({ page }) => {
  await interceptStatus(page);
  await login(page);
  await gotoPage(page, "/service-status", "服务状态");
  const root = page.locator(".service-status");
  await expect(root.getByRole("img")).toHaveCount(7);
  await expect(root.locator("article")).toHaveCount(7);
  await expect(root.getByText(/模拟数据|预置样例|Mock|实时采集/)).toHaveCount(0);
  await expect(root.locator(".page-header__text p, .health-card__heading p, .health-card__center span, .service-status__note")).toHaveCount(0);
  await expect(root.locator(".health-card__segment.liquid-glass-material")).toHaveCount(10);
  await expect(root.locator(".health-card__segment--healthy").first()).toHaveCSS("backdrop-filter", "blur(2px) saturate(1.12)");
  await expect(root.locator("article button, article a, details, table")).toHaveCount(0);
  await expect(root.getByRole("img", { name: /后端服务：健康率 87.5%，健康 7，异常 0，未知 1/ })).toBeVisible();
  await expect(root.getByRole("img", { name: /园区遥感设备：健康率 95.8%，健康 46，异常 2/ })).toBeVisible();
  await expect(root.locator('[data-module="staff"] .health-card__segment--abnormal')).toHaveAttribute("data-offset", /66\.666/);
  await expect(root.locator('[data-module="admin"] .health-card__segment--healthy')).toHaveAttribute("data-percent", "100");

  await page.evaluate(() => { window.__healthTest = { mode: "states" }; });
  await root.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(root.getByRole("img", { name: /后端服务：健康率 0%，健康 0，异常 8/ })).toBeVisible();
  await expect(root.locator('[data-module="backend"] .health-card__segment--abnormal')).toHaveAttribute("data-percent", "100");
  await expect(root.getByRole("img", { name: "园区遥感设备：暂无检测数据" })).toBeVisible();
  await expect(root.locator('[data-module="devices"]')).not.toContainText("0%");
  await expect(root.getByRole("img", { name: /导览：健康率 0%，健康 0，异常 0，未知 6/ })).toBeVisible();
  await expect(root.locator('[data-module="guide"] .health-card__segment--healthy')).toHaveCount(0);

  await page.evaluate(() => { window.__healthTest = { mode: "invalid" }; });
  await root.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(root.getByText("检测数据不可用", { exact: true })).toHaveCount(2);
  await expect(root.getByRole("img")).toHaveCount(7);
  await expect(root.getByRole("img", { name: /游客端小程序：健康率 100%/ })).toBeVisible();
});

test("加载与首次失败可重试，刷新失败保留七环及原检测时间", async ({ page }) => {
  await interceptStatus(page);
  await login(page);
  await page.evaluate(() => { window.__healthTest = { mode: "throw", delay: 600 }; });
  await gotoPage(page, "/service-status", "服务状态");
  const root = page.locator(".service-status");
  await expect(root.getByText("正在读取…")).toBeVisible();
  await expect(root.getByRole("img")).toHaveCount(0);
  await expect(root.getByRole("alert")).toContainText("读取失败");
  await page.evaluate(() => { window.__healthTest = {}; });
  await root.getByRole("button", { name: "重试", exact: true }).click();
  await expect(root.getByRole("img")).toHaveCount(7);
  const initialTime = await root.locator("time").first().getAttribute("datetime");
  const readTime = await root.locator("time").last().getAttribute("datetime");

  for (const mode of ["fail", "throw", "envelope"] as const) {
    await page.evaluate(mode => { window.__healthTest = { mode, delay: 450 }; }, mode);
    await root.getByRole("button", { name: "刷新", exact: true }).click();
    await expect(root.getByRole("button", { name: "刷新", exact: true })).toBeDisabled();
    await expect(root.getByRole("img")).toHaveCount(7);
    await expect(root.getByRole("alert")).toContainText("刷新失败，当前仍为上次读取的数据");
    await expect(root.locator("time").first()).toHaveAttribute("datetime", initialTime!);
    await expect(root.locator("time").last()).toHaveAttribute("datetime", readTime!);
  }
  await page.evaluate(() => { window.__healthTest = {}; });
  await root.getByRole("button", { name: "重试", exact: true }).click();
  await expect(root.getByRole("alert")).toHaveCount(0);
  await expect(root.locator("time").last()).not.toHaveAttribute("datetime", readTime!);
  await expect(root.locator("time").first()).toHaveAttribute("datetime", initialTime!);
});

test("与工作台共享玻璃、标题层级和深浅主题，PC宽屏无横向溢出", async ({ page }, testInfo) => {
  await login(page);
  await page.locator(".toast-host").getByRole("button", { name: "关闭", exact: true }).click();
  await gotoPage(page, "/service-status", "服务状态");
  const root = page.locator(".service-status");
  await expect(root.getByRole("img")).toHaveCount(7);
  await expect(root.locator(".health-card.liquid-glass-material")).toHaveCount(7);
  await expect(root.getByRole("heading", { level: 1 })).toHaveCSS("font-size", "36px");
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(async theme => {
      // @ts-expect-error 浏览器 Vite 模块路径，仅用于测试。
      const { setAppearance } = await import("/src/app/theme.ts");
      setAppearance(theme);
    }, theme);
    await expect(page.locator("body")).toHaveAttribute("data-theme", theme);
    await expect(root.locator('[data-module="backend"] .health-card__dot').last()).toHaveCSS("background-color", theme === "dark" ? "rgb(145, 152, 149)" : "rgb(192, 200, 196)");
    if (theme === "dark") {
      await expect(root.locator(".health-card__segment--healthy").first()).toHaveCSS("background-color", "rgba(64, 203, 145, 0.52)");
      await expect(root.locator(".health-card__segment--abnormal").first()).toHaveCSS("background-color", "rgba(255, 112, 111, 0.62)");
    }
    for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768]]) {
      await page.setViewportSize({ width, height });
      await expect(root.getByRole("img")).toHaveCount(7);
      const overflow = await root.evaluate(el => el.scrollWidth > el.clientWidth + 1);
      expect(overflow, `${theme} ${width}px page overflow`).toBe(false);
      for (const card of await root.locator("article").all()) {
        expect(await card.evaluate(el => el.scrollWidth > el.clientWidth + 1), `${theme} ${width}px card overflow`).toBe(false);
      }
      if (width === 1440) await page.screenshot({ path: testInfo.outputPath(`service-${theme}-${width}.png`), fullPage: true });
    }
  }
  await expect(page.getByRole("combobox", { name: "页面导航" })).toBeHidden();
});
