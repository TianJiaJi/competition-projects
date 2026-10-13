import { test, expect } from "@playwright/test";
import { scenario } from "../../scenario/config";
const url = `http://localhost:${scenario.ports.public}/`;
async function ready(page: import("@playwright/test").Page) {
  await expect(page.locator(".scene-shell")).toHaveAttribute(
    "data-intro-state",
    "ready",
    { timeout: 45000 },
  );
  await expect(page.locator(".stage-interface")).not.toHaveAttribute("inert");
  await expect(page.locator(".global-loading")).toHaveCount(0);
}
for (const size of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`公共沙盘布局与浮层 ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url);
    await ready(page);
    await expect(page.locator(".page-nav,.app-footer,.map-marker")).toHaveCount(
      0,
    );
    await expect(page.locator(".stage-view-button")).toHaveCount(3);
    await expect(page.locator(".stage-identity")).toContainText(scenario.name);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(size.width);
    await page.screenshot({
      path: `test-results/public-${size.width}-light.png`,
    });
    await page.getByRole("button", { name: "空间", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      scenario.screens.spaceTitle,
    );
    await page
      .getByRole("textbox", { name: "搜索" + scenario.labels.facilities })
      .fill(scenario.seed.facilities[0].title);
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: new RegExp(scenario.seed.facilities[0].title),
      })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      scenario.seed.facilities[0].description,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox")).toBeVisible();
    await page.getByRole("textbox").fill("不存在");
    await expect(page.getByText("暂时没有匹配的记录")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "空间", exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "服务", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      scenario.screens.serviceTitle,
    );
    if (scenario.kind === "campus") {
      await expect(
        page.getByRole("button", { name: "场馆信息", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("dialog")).not.toContainText("停车");
    }
    await page
      .getByRole("button", { name: scenario.labels.bookings, exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      scenario.seed.bookings[0].title,
    );
    await page.keyboard.press("Escape");
    await page.locator(".notice-pill").click();
    await expect(page.getByRole("dialog")).toContainText(
      scenario.labels.notices,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "概况", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      scenario.metricLabels.primary,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "切换深色" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({
      path: `test-results/public-${size.width}-dark.png`,
    });
    await page.getByRole("button", { name: "空间", exact: true }).click();
    await page
      .getByRole("button", { name: "查看全部" + scenario.labels.facilities })
      .click();
    await expect(page).toHaveURL(url + "#/facilities");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      scenario.labels.facilities,
    );
    if (size.width <= 650)
      await page.getByRole("button", { name: "打开导航" }).click();
    await page.getByRole("button", { name: "总览", exact: true }).click();
    await ready(page);
  });
}
test("公共沙盘开场后才开放气泡与模型工具", async ({ page }) => {
  await page.goto(url);
  await expect(page.locator(".global-loading")).toHaveCount(0, {
    timeout: 45000,
  });
  const state = await page
    .locator(".scene-shell")
    .getAttribute("data-intro-state");
  if (state !== "ready") {
    await expect(page.locator(".stage-interface")).toHaveAttribute("inert", "");
    await expect(page.locator(".model-tools")).toHaveAttribute("inert", "");
  }
  await ready(page);
  await page.getByRole("button", { name: "空间", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
