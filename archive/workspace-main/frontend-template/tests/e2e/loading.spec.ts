import { test, expect } from "@playwright/test";
import { scenario } from "../../scenario/config";

for (const terminal of ["public"] as const) {
  test(`${terminal} 加载完成前隐藏全部页面内容`, async ({ page }) => {
    let release!: () => void;
    let moduleRequested = false;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname.endsWith("/components/ModelBrowser.vue"),
      async (route) => {
        moduleRequested = true;
        await delayed;
        await route.continue();
      },
    );
    await page.goto(`http://localhost:${scenario.ports[terminal]}`, {
      waitUntil: "domcontentloaded",
    });
    const content = page.locator(".app-background");
    const loader = page.locator(".global-loading");
    await expect(loader).toBeVisible();
    await expect.poll(() => moduleRequested).toBe(true);
    await expect(loader.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    await expect(content).toHaveAttribute("inert", "");
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(page.locator("main")).toBeHidden();
    await expect(page.locator(".app-footer")).toBeHidden();
    await page.keyboard.press("Tab");
    expect(
      await content.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(false);

    // Observe the real progress bar, including the final 300 ms ink transition.
    await page.evaluate(() => {
      const audit = { fullAt: 0, revealedAt: 0, leaked: false };
      (window as any).loadingAudit = audit;
      const observer = new MutationObserver(() => {
        const loader = document.querySelector(".global-loading");
        const content = document.querySelector(".app-background")!;
        if (loader) {
          if (loader.querySelector('[aria-valuenow="100"]') && !audit.fullAt)
            audit.fullAt = performance.now();
          if (getComputedStyle(content).visibility !== "hidden")
            audit.leaked = true;
        } else {
          audit.revealedAt = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    });
    release();
    await expect(loader).toHaveCount(0, { timeout: 45000 });
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(content).not.toHaveAttribute("inert");
    await expect(page.getByRole("button", { name: "放大沙盘" })).toBeVisible();
    const audit = await page.evaluate(() => (window as any).loadingAudit);
    expect(audit.leaked).toBe(false);
    expect(audit.fullAt).toBeGreaterThan(0);
    expect(audit.revealedAt - audit.fullAt).toBeGreaterThanOrEqual(280);
    await expect(page.locator(".scene-shell")).toHaveAttribute(
      "data-intro-state",
      "ready",
      { timeout: 45000 },
    );

    await page.evaluate(() => {
      location.hash = "/facilities";
    });
    await expect(page.locator(".scene-shell")).toHaveCount(0);
    await expect(loader).toHaveCount(0);
    await page.evaluate(() => {
      location.hash = "/overview";
    });
    await expect(content).toHaveAttribute("data-loading", "true");
    await expect(page.locator(".topbar")).toBeHidden();
    await expect(loader).toHaveCount(0, { timeout: 45000 });
    await expect(page.locator(".topbar")).toBeVisible();
  });
}

test("沙盘模块加载失败后恢复页面并显示错误", async ({ page }) => {
  await page.route(
    (url) => url.pathname.endsWith("/components/ModelBrowser.vue"),
    (route) => route.abort(),
  );
  await page.goto(`http://localhost:${scenario.ports.public}`);
  await expect(page.getByRole("alert")).toHaveText("沙盘加载失败，请刷新重试");
  await expect(page.locator(".global-loading")).toHaveCount(0);
  await expect(page.locator(".topbar")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "/facilities";
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => {
    location.hash = "/overview";
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".global-loading")).toHaveCount(0);
});
