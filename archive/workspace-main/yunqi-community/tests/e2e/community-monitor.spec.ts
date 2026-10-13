import { test, expect } from "@playwright/test";
const url = "http://localhost:5401/";
async function ready(page: import("@playwright/test").Page) {
  await expect(page.locator(".community-monitor")).toHaveAttribute(
    "data-entry-state",
    "ready",
    { timeout: 45000 },
  );
  await expect(page.locator(".global-loading")).toHaveCount(0);
}
for (const size of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
]) {
  test(`监控三面围合布局 ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto(url);
    await ready(page);
    const box = (selector: string) => page.locator(selector).boundingBox();
    const [map, charts, left, right] = await Promise.all(
      [
        ".monitor-model",
        ".monitor-charts",
        ".monitor-left",
        ".monitor-right",
      ].map(box),
    );
    expect(map!.y).toBeGreaterThan(charts!.y + charts!.height - 1);
    expect(map!.x).toBeGreaterThan(left!.x + left!.width);
    expect(map!.x + map!.width).toBeLessThan(right!.x);
    expect(
      Math.abs(map!.y + map!.height - left!.y - left!.height),
    ).toBeLessThan(2);
    expect(
      Math.abs(map!.y + map!.height - right!.y - right!.height),
    ).toBeLessThan(2);
    expect(Math.abs(map!.x + map!.width / 2 - size.width / 2)).toBeLessThan(2);
    expect(
      await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      })),
    ).toEqual(size);
    await expect(page.locator(".page-nav,.app-footer")).toHaveCount(0);
    await expect(page.locator(".monitor-row button")).toHaveCount(0);
    await page.getByRole("button", { name: "暂停旋转" }).click();
    await page.getByRole("button", { name: "放大沙盘" }).click();
    await page.getByRole("button", { name: "复位沙盘" }).click();
    await expect(page.getByRole("button", { name: "继续旋转" })).toBeVisible();
    const host = page.getByTestId("community-canvas");
    await expect(host).toHaveAttribute("data-flying", "false");
    const footprint = JSON.parse(
      (await host.getAttribute("data-scroll-footprint"))!,
    );
    expect(Math.abs(footprint[2][1] - footprint[3][1])).toBeLessThan(0.001);
    expect(footprint[2][1]).toBeCloseTo(-1.035, 3);
    await expect(page.getByText(/摘要/)).toHaveCount(0);
    await page.screenshot({
      path: `test-results/monitor-${size.width}-dark.png`,
    });
    await page.getByRole("button", { name: "切换浅色" }).click();
    await page.screenshot({
      path: `test-results/monitor-${size.width}-light.png`,
    });
  });
}
test("默认暖色暗色、只读职责及旧地址归一", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url + "#/security");
  await ready(page);
  await expect(page).toHaveURL(url + "#/overview");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--canvas")
        .trim(),
    ),
  ).toBe("#29221e");
  const link = page.getByRole("link", { name: "管理中心" });
  await expect(link).toHaveAttribute(
    "href",
    "http://localhost:5404/#/overview",
  );
  await expect(link).toHaveAttribute("target", "_blank");
  for (const hash of ["tasks", "facilities", "security"]) {
    await page.evaluate((hash) => (location.hash = "/" + hash), hash);
    await expect(page).toHaveURL(url + "#/overview");
    await expect(page.locator(".community-monitor")).toHaveAttribute(
      "data-entry-state",
      "ready",
    );
  }
  await page.getByRole("button", { name: "切换浅色" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "用水", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "用水", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".community-monitor")).toHaveAttribute(
    "data-entry-state",
    "ready",
  );
  await page.reload();
  await ready(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
test("真实加载后面板先入场、沙盘最后出现且只播放一次", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname.endsWith("/components/ModelBrowser.vue"),
    async (route) => {
      await gate;
      await route.continue();
    },
  );
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".global-loading")).toBeVisible();
  await expect(page.locator(".monitor-content")).toHaveAttribute("inert", "");
  await expect(page.locator(".monitor-masthead")).toBeHidden();
  await page.keyboard.press("Tab");
  expect(
    await page
      .locator(".monitor-content")
      .evaluate((el) => el.contains(document.activeElement)),
  ).toBe(false);
  await page.evaluate(() => {
    const audit = {
      states: [] as string[],
      started: 0,
      fullAt: 0,
      elapsed: 0,
      delays: [] as string[],
    };
    (window as any).monitorAudit = audit;
    new MutationObserver(() => {
      if (document.querySelector('[aria-valuenow="100"]') && !audit.fullAt)
        audit.fullAt = performance.now();
      const phase = document
        .querySelector(".community-monitor")
        ?.getAttribute("data-entry-state");
      if (phase && audit.states.at(-1) !== phase) {
        audit.states.push(phase);
        if (phase === "entering") {
          audit.started = performance.now();
          audit.delays = [
            ".monitor-masthead",
            ".monitor-security",
            ".monitor-model",
          ].map(
            (s) => getComputedStyle(document.querySelector(s)!).animationDelay,
          );
        }
        if (phase === "ready")
          audit.elapsed = performance.now() - audit.started;
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      childList: true,
    });
  });
  release();
  await ready(page);
  const audit = await page.evaluate(() => (window as any).monitorAudit);
  expect(audit.states).toContain("entering");
  expect(audit.started - audit.fullAt).toBeGreaterThanOrEqual(280);
  expect(audit.elapsed).toBeGreaterThanOrEqual(2200);
  expect(audit.delays).toEqual(["0s", "0.42s", "1.37s"]);
  await page.getByRole("button", { name: "切换浅色" }).click();
  await page.getByRole("button", { name: "用水", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        (window as any).monitorAudit.states.filter(
          (s: string) => s === "entering",
        ).length,
    ),
  ).toBe(1);
});
test("沙盘加载失败仍显示监控与错误占位", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(
    (url) => url.pathname.endsWith("/components/ModelBrowser.vue"),
    (route) => route.abort(),
  );
  await page.goto(url);
  await ready(page);
  await expect(page.getByRole("alert")).toHaveText("沙盘加载失败，请刷新重试");
  await expect(
    page.getByRole("heading", { name: "公共能耗趋势" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "切换浅色" }).click();
});
test("窄屏依次堆叠、沙盘最后显示", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await ready(page);
  const map = await page.locator(".monitor-model").boundingBox();
  const facilities = await page.locator(".monitor-facilities").boundingBox();
  expect(map!.y).toBeGreaterThan(facilities!.y + facilities!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});
