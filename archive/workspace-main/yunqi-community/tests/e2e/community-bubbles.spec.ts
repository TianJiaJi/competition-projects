import { test, expect } from "@playwright/test";
import { scenario } from "../../scenario/config";
for (const terminal of ["public"] as const) {
  test(`${terminal} 悬浮菜单、子分类、详情与通知气泡`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`http://localhost:${scenario.ports[terminal]}`);
    await expect(page.locator(".community-map")).toHaveAttribute(
      "data-intro-state",
      "ready",
    );
    await expect(page.locator(".stage-popover")).toHaveCount(0);
    const spaces = page.getByRole("button", { name: "空间", exact: true });
    await spaces.click();
    const bubble = page.getByRole("dialog", { name: "社区空间", exact: true });
    await expect(bubble).toBeVisible();
    await page.getByRole("button", { name: "房屋楼栋", exact: true }).click();
    await expect(bubble).toContainText("1号楼");
    await page.getByRole("button", { name: "便民设施", exact: true }).click();
    await bubble
      .getByRole("textbox", { name: "搜索便民设施" })
      .fill("邻里会客厅");
    await bubble.getByRole("button", { name: /邻里会客厅/ }).click();
    await expect(bubble).toContainText("开放时间");
    await page.keyboard.press("Escape");
    await expect(bubble.getByRole("textbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveCount(0);
    await expect(spaces).toBeFocused();
    await page.locator(".notice-pill").click();
    const notices = page.getByRole("dialog", { name: "社区公告" });
    await expect(notices).toContainText(scenario.seed.notices[0].title);
    await notices
      .getByRole("button", { name: new RegExp(scenario.seed.notices[0].title) })
      .click();
    await expect(notices).toContainText(scenario.seed.notices[0].description);
    await page
      .locator(".stage-landscape")
      .click({ position: { x: 680, y: 80 } });
    await expect(notices).toHaveCount(0);
    await spaces.click();
    await bubble.getByRole("button", { name: "查看全部便民设施" }).click();
    await expect(page).toHaveURL(/#\/facilities/);
    await expect(
      page.getByRole("textbox", { name: "搜索便民设施" }),
    ).toBeVisible();
  });
}
test("卷轴保持固定朝向，自动旋转和拖动只改变岛体", async ({ page }) => {
  await page.goto(`http://localhost:${scenario.ports.ops}`);
  const host = page.getByTestId("community-canvas");
  await expect(page.locator(".community-map")).toHaveAttribute(
    "data-intro-state",
    "ready",
  );
  const camera = await host.getAttribute("data-camera"),
    heading = await host.getAttribute("data-heading");
  await expect(host).not.toHaveAttribute("data-heading", heading!);
  await expect(host).toHaveAttribute("data-camera", camera!);
  await expect(host).toHaveAttribute("data-scroll-heading", "0");
  await page.getByRole("button", { name: "暂停旋转" }).click();
  const previous = await host.getAttribute("data-heading");
  const r = (await host.boundingBox())!;
  await page.mouse.move(r.x + r.width * 0.4, r.y + r.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.65, r.y + r.height * 0.5, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(host).not.toHaveAttribute("data-heading", previous!);
  await expect(host).toHaveAttribute("data-camera", camera!);
  await expect(host).toHaveAttribute("data-scroll-heading", "0");
});

test("01 管理大屏保留运行面板，不使用 00 气泡菜单", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`http://localhost:${scenario.ports.ops}`);
  await expect(page.locator(".community-map")).toHaveAttribute(
    "data-intro-state",
    "ready",
  );
  await expect(page.locator(".ops-stage")).toBeVisible();
  await expect(page.locator(".metric-grid")).toBeVisible();
  await expect(page.locator(".stage-dock")).toHaveCount(0);
  await expect(page.locator(".community-marker")).toHaveCount(0);
});

test("Dock 与设施详情互斥，始终仅保留当前气泡连线", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`http://localhost:${scenario.ports.public}`);
  await expect(page.locator(".community-map")).toHaveAttribute(
    "data-intro-state",
    "ready",
  );
  await page.getByRole("button", { name: "公共", exact: true }).click();
  const dock = page.getByRole("button", { name: "空间", exact: true });
  await dock.click();
  await expect(page.locator(".community-card-leader line")).toHaveCount(1);
  await page.getByTestId("community-marker-F1").click();
  await expect(page.locator(".stage-popover")).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "邻里会客厅详情" }),
  ).toBeVisible();
  await expect(page.locator(".community-card-leader line")).toHaveCount(1);
  await dock.click();
  await expect(page.locator(".facility-bubble")).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "社区空间", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".community-card-leader line")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".community-card-leader")).toHaveCount(0);
});

test("住宅和花园标点有正确归属，旋转保持固定层级", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`http://localhost:${scenario.ports.public}`);
  const canvas = page.getByTestId("community-canvas");
  await expect(canvas).toHaveAttribute("data-intro-state", "ready");
  await expect(page.locator(".community-marker")).toHaveCount(9);
  for (const id of ["F4", "F6"])
    await expect(page.getByTestId(`community-marker-${id}`)).toHaveCount(0);
  for (const [i, n] of ["I", "II", "III", "IV", "V", "VI"].entries())
    await expect(page.getByTestId(`community-marker-B${i + 1}`)).toContainText(
      `单元楼 ${n} 栋`,
    );
  const left = (await page
      .getByTestId("community-marker-villa-I")
      .boundingBox())!,
    right = (await page
      .getByTestId("community-marker-villa-II")
      .boundingBox())!;
  expect(left.x).toBeLessThan(right.x);
  await page.getByRole("button", { name: "公共", exact: true }).click();
  await page.getByTestId("community-marker-garden").click();
  await expect(
    page.getByRole("dialog", { name: "中央花园详情" }),
  ).toContainText("喷泉");
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-focused", "");
  await page.getByRole("button", { name: "住房", exact: true }).click();
  await page.getByTestId("community-marker-B1").click();
  await expect(
    page.getByRole("dialog", { name: "单元楼 I 栋详情" }),
  ).toContainText("东区");
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-focused", "");
  const line = page.locator('.marker-leaders line[data-anchor="B2"]');
  const offset = () =>
    line.evaluate(
      (el) => Number(el.getAttribute("y1")) - Number(el.getAttribute("y2")),
    );
  expect(await offset()).toBe(44);
  await page.mouse.move(680, 610);
  await page.mouse.down();
  await page.mouse.move(830, 610, { steps: 18 });
  await page.mouse.up();
  expect(await offset()).toBe(44);
});

test("住房、公共、安全分层互斥，安全层包含东西两侧道闸", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`http://localhost:${scenario.ports.public}`);
  await expect(page.locator(".community-map")).toHaveAttribute(
    "data-intro-state",
    "ready",
  );
  await expect(
    page.getByRole("button", { name: "住房", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".community-marker")).toHaveCount(9);
  await page.getByRole("button", { name: "公共", exact: true }).click();
  await expect(page.locator(".community-marker")).toHaveCount(6);
  await expect(page.getByTestId("community-marker-B1")).toHaveCount(0);
  await page.getByTestId("community-marker-garden").click();
  await expect(
    page.getByRole("dialog", { name: "中央花园详情" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "安全", exact: true }).click();
  await expect(page.locator(".facility-bubble")).toHaveCount(0);
  await expect(page.locator(".community-card-leader")).toHaveCount(0);
  await expect(page.locator(".community-marker")).toHaveCount(10);
  await expect(page.getByTestId("community-marker-F3")).toBeVisible();
  await expect(page.getByTestId("community-marker-west-gate")).toBeVisible();
  await expect(page.getByTestId("community-marker-F5")).toBeVisible();
  await expect(page.getByTestId("community-marker-aed-club")).toBeVisible();
  await expect(page.getByTestId("community-marker-aed-center")).toBeVisible();
  await expect(page.getByTestId("community-canvas")).toHaveAttribute(
    "data-context-muted",
    "true",
  );
  await page.getByTestId("community-marker-west-gate").click();
  await expect(
    page.getByRole("dialog", { name: "西门智能道闸详情" }),
  ).toContainText("西侧车行入口");
  await expect(page.locator(".community-card-leader line")).toHaveCount(1);
  await page.getByRole("button", { name: "住房", exact: true }).click();
  await expect(page.locator(".community-marker")).toHaveCount(9);
  await expect(page.locator(".facility-bubble")).toHaveCount(0);
});

test("刷新始终回到住房视图并清空详情和连线", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`http://localhost:${scenario.ports.public}`);
  const host = page.getByTestId("community-canvas");
  await expect(host).toHaveAttribute("data-intro-state", "ready");
  for (const label of ["公共", "安全"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    if (label === "安全")
      await page.getByTestId("community-marker-aed-club").click();
    await page.reload();
    await expect(host).toHaveAttribute("data-intro-state", "ready");
    await expect(
      page.getByRole("button", { name: "住房", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(host).toHaveAttribute("data-view-mode", "housing");
    await expect(host).toHaveAttribute("data-context-muted", "false");
    await expect(
      page.locator(".facility-bubble,.stage-popover,.community-card-leader"),
    ).toHaveCount(0);
    await expect(page.locator(".community-marker")).toHaveCount(9);
  }
});
