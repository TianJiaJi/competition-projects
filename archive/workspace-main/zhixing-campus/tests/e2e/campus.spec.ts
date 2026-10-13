import { test, expect } from "@playwright/test";
const url = "http://localhost:5500/";
async function ready(page: import("@playwright/test").Page) {
  await expect(page.locator(".campus-canvas")).toHaveAttribute(
    "data-intro-state",
    "ready",
    { timeout: 45000 },
  );
  await expect(page.locator(".global-loading")).toHaveCount(0);
}
for (const width of [1920, 1366])
  test(`校园三视图及标签避让 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await ready(page);
    await expect(page.locator(".stage-view-button")).toHaveText([
      "学习",
      "生活",
      "安全",
    ]);
    await expect(
      page.getByRole("button", { name: "学习", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".campus-marker")).toHaveCount(6);
    const bounds = await page.locator(".campus-marker").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    for (let i = 0; i < bounds.length; i++)
      for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i],
          b = bounds[j];
        expect(
          a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y,
          "academic labels overlap",
        ).toBe(true);
      }
    if (width === 1920)
      await page.screenshot({ path: "docs/assets/campus/public-learning.png" });
    await page.getByRole("button", { name: "生活", exact: true }).click();
    for (let i = 1; i <= 4; i++)
      await expect(page.getByTestId(`campus-marker-dorm-${i}`)).toBeVisible();
    await expect(page.getByTestId("campus-marker-clinic")).toHaveCount(0);
    await page.getByTestId("campus-marker-dorm-2").click();
    await expect(page.getByRole("dialog")).toContainText("三个子栋");
    await expect(page.locator(".campus-canvas")).toHaveAttribute(
      "data-focused",
      "dorm-2",
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "安全", exact: true }).click();
    await expect(
      page.locator('[data-testid^="campus-marker-aed-"]'),
    ).toHaveCount(6);
    await expect(
      page.locator('[data-testid^="campus-marker-fire-"]'),
    ).toHaveCount(9);
    await expect(page.locator(".campus-canvas")).toHaveAttribute(
      "data-context-muted",
      "true",
    );
    await page.getByTestId("campus-marker-clinic").click();
    await expect(page.getByRole("dialog")).toContainText("校医务室");
    await page.keyboard.press("Escape");
    if (width === 1920)
      await page.screenshot({ path: "docs/assets/campus/public-safety.png" });
    await page.getByRole("button", { name: "切换深色" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "学习", exact: true }).click();
    await expect(page.locator(".campus-canvas")).toHaveAttribute(
      "data-context-muted",
      "false",
    );
    if (width === 1920)
      await page.screenshot({ path: "docs/assets/campus/public-dark.png" });
    await page.reload();
    await ready(page);
    await expect(
      page.getByRole("button", { name: "学习", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(errors).toEqual([]);
  });
test("湖面有真实画面变化并响应减少动态效果", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await ready(page);
  await page.getByRole("button", { name: "暂停旋转" }).click();
  await page.getByRole("button", { name: "生活", exact: true }).click();
  await page.getByTestId("campus-marker-lake").click();
  await expect(page.locator(".campus-canvas")).toHaveAttribute(
    "data-flying",
    "false",
  );
  const clip = await page
    .locator('.marker-leaders line[data-anchor="lake"]')
    .evaluate((line) => ({
      x: Number(line.getAttribute("x1")) - 80,
      y: Number(line.getAttribute("y1")) + 30,
      width: 130,
      height: 80,
    }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(250);
  const a = await page.screenshot({ clip });
  await page.waitForTimeout(700);
  const b = await page.screenshot({ clip });
  expect(a.equals(b)).toBe(false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);
  const c = await page.screenshot({ clip });
  await page.waitForTimeout(400);
  const d = await page.screenshot({ clip });
  expect(c.equals(d)).toBe(true);
});
test("校园图形失败可提示并在刷新后恢复", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await ready(page);
  await page
    .locator(".campus-canvas canvas")
    .evaluate((canvas) =>
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await expect(page.getByRole("alert")).toContainText("沙盘加载失败");
  await page.reload();
  await ready(page);
});
