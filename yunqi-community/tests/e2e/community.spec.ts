import { test, expect } from "@playwright/test";
import { scenario } from "../../scenario/config";

for (const terminal of ["public", "ops", "preview"] as const) {
  test(`${terminal} 社区组件支持缩放、旋转、复位、尺寸变化及重进`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://localhost:${scenario.ports[terminal]}`);
    const shell = page.locator(".community-map"),
      host = page.getByTestId("community-canvas");
    await expect(shell).toHaveAttribute("data-intro-state", "ready");
    await expect(page.locator(".global-loading")).toHaveCount(0);
    await expect(host.locator("canvas")).toHaveAttribute(
      "aria-label",
      /云栖雅苑/,
    );
    await page.getByRole("button", { name: "暂停旋转" }).click();
    const initialCamera = await host.getAttribute("data-camera");
    await page.getByRole("button", { name: "放大沙盘" }).click();
    await expect(host).toHaveAttribute("data-zoom", "1.150");
    await page.getByRole("button", { name: "缩小沙盘" }).click();
    await expect
      .poll(async () => Number(await host.getAttribute("data-zoom")))
      .toBeCloseTo(1, 2);
    const camera = await host.getAttribute("data-camera");
    const heading = await host.getAttribute("data-heading");
    const rect = (await host.boundingBox())!;
    await page.mouse.move(
      rect.x + rect.width * 0.5,
      rect.y + rect.height * 0.5,
    );
    await page.mouse.down();
    await page.mouse.move(
      rect.x + rect.width * 0.75,
      rect.y + rect.height * 0.5,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect(host).not.toHaveAttribute("data-heading", heading!);
    await expect(host).toHaveAttribute("data-camera", camera!);
    await expect(host).toHaveAttribute(
      "data-scroll-heading",
      terminal !== "preview" ? Math.atan2(36, 188).toFixed(5) : "0",
    );
    await page.getByRole("button", { name: "复位沙盘" }).click();
    await expect(host).toHaveAttribute("data-camera", initialCamera!);
    await expect(host).toHaveAttribute("data-zoom", "1.000");
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect
      .poll(() =>
        host
          .locator("canvas")
          .evaluate(
            (el) =>
              (el as HTMLCanvasElement).width > 0 &&
              (el as HTMLCanvasElement).height > 0,
          ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (terminal === "public") {
      await page.evaluate(() => {
        location.hash = "/facilities";
      });
      await expect(shell).toHaveCount(0);
      await page.evaluate(() => {
        location.hash = "/overview";
      });
      await expect(shell).toHaveAttribute("data-intro-state", "ready");
      await expect(host.locator("canvas")).toHaveCount(1);
    }
    expect(errors).toEqual([]);
  });
}
test("自动旋转可暂停，减少动态效果会停止旋转", async ({ page }) => {
  await page.goto(`http://localhost:${scenario.ports.ops}`);
  const host = page.getByTestId("community-canvas");
  await expect(page.locator(".community-map")).toHaveAttribute(
    "data-intro-state",
    "ready",
  );
  const heading = await host.getAttribute("data-heading");
  await expect(host).not.toHaveAttribute("data-heading", heading!);
  await page.getByRole("button", { name: "暂停旋转" }).click();
  const stopped = await host.getAttribute("data-heading");
  await page.waitForTimeout(250);
  await expect(host).toHaveAttribute("data-heading", stopped!);
  await page.getByRole("button", { name: "继续旋转" }).click();
  await expect(host).not.toHaveAttribute("data-heading", stopped!);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "复位沙盘" }).click();
  await page.waitForTimeout(250);
  await expect(host).toHaveAttribute("data-heading", "0.0000");
});
test("WebGL 上下文丢失显示错误且刷新后可重建", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`http://localhost:${scenario.ports.ops}`);
  await expect(page.locator(".community-map")).toHaveAttribute(
    "data-intro-state",
    "ready",
  );
  await page
    .getByTestId("community-canvas")
    .locator("canvas")
    .evaluate((el) =>
      el.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(page.getByRole("alert")).toHaveText("沙盘加载失败，请刷新重试");
  await expect(page.locator(".global-loading")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "公共能耗趋势" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".community-map")).toHaveAttribute(
    "data-intro-state",
    "ready",
  );
});
