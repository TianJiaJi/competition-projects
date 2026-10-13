import { test, expect } from "@playwright/test";

test("00 卷轴横边水平，展开后推进，界面等待运镜结束", async ({ page }) => {
  await page.goto("http://localhost:5400/");
  const host = page.getByTestId("community-canvas");
  const chrome = page.locator(".stage-interface");
  await expect(host).toHaveAttribute("data-intro-state", "opening");
  await expect(chrome).toHaveAttribute("inert", "");
  await expect(page.locator(".stage-dock")).toHaveCSS("opacity", "0");
  await expect(page.locator(".model-tools")).toHaveCSS("opacity", "0");
  await expect(page.locator(".community-marker")).toHaveCount(0);
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[data-testid="community-canvas"]')
          ?.getAttribute("data-intro-time"),
      ) >= 2.65,
  );
  const opening = JSON.parse(
    (await host.getAttribute("data-scroll-footprint"))!,
  );
  expect(Math.abs(opening[0][1] - opening[1][1])).toBeLessThan(0.001);
  expect(opening[2][1]).toBeGreaterThan(-1);
  const start = await host.getAttribute("data-camera");
  await expect(host).toHaveAttribute("data-intro-state", "revealing");
  await expect(page.locator(".stage-dock")).toHaveCSS("opacity", "0");
  await expect(host).toHaveAttribute("data-intro-state", "ready");
  await expect(host).not.toHaveAttribute("data-camera", start!);
  await expect(chrome).not.toHaveAttribute("inert", "");
  await expect(page.locator(".stage-dock")).toHaveCSS("opacity", "1");
  await expect(page.locator(".stage-dock")).toHaveCSS(
    "transition-duration",
    "0.6s",
  );
  await expect(page.locator(".model-tools")).toBeVisible();
  const end = JSON.parse((await host.getAttribute("data-scroll-footprint"))!);
  expect(Math.abs(end[2][1] - end[3][1])).toBeLessThan(0.001);
  expect(end[2][1]).toBeCloseTo(-1.035, 3);
  await page.screenshot({ path: ".local/community-qa/scroll-final.png" });
  await page.getByRole("button", { name: "暂停旋转" }).click();
  const overview = await host.getAttribute("data-camera");
  await page.getByRole("button", { name: "放大沙盘" }).click();
  await expect(host).toHaveAttribute("data-flying", "true");
  await expect(host).toHaveAttribute("data-flying", "false");
  await expect(host).toHaveAttribute("data-zoom", "1.150");
  const near = await host.getAttribute("data-camera");
  await page.getByRole("button", { name: "复位沙盘" }).click();
  await expect(host).toHaveAttribute("data-flying", "true");
  expect(await host.getAttribute("data-camera")).not.toBe(overview);
  await expect(host).not.toHaveAttribute("data-camera", near!);
  await expect(host).toHaveAttribute("data-flying", "false");
  await expect(host).toHaveAttribute("data-camera", overview!);
  await expect(host).toHaveAttribute("data-heading", "0.0000");
  await expect(host).toHaveAttribute("data-zoom", "1.000");
});
