import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
const C01 = JSON.parse(
  readFileSync(
    new URL("../../packages/demo/assets/C01.json", import.meta.url),
    "utf8",
  ),
);
const workbench = "http://localhost:5506/";
async function node(page: Page, id: string) {
  const close = page.getByRole("button", { name: "关闭节点详情" });
  if (await close.count()) await close.click();
  await page.getByRole("button", { name: "全图", exact: true }).click();
  await page.getByTestId(`node-${id}`).click();
}
async function execute(page: Page, id: string) {
  await node(page, id);
  await page.locator(".drawer-footer button").click();
}
async function jump(page: Page, label: string) {
  await page.getByRole("button", { name: "恢复与直达", exact: true }).click();
  await page
    .getByRole("button", { name: `排练直达 · ${label}`, exact: true })
    .click();
}
async function openStage(page: Page, id: string) {
  await node(page, id);
  const popup = page.waitForEvent("popup");
  await page.locator(".drawer-footer button").click();
  return popup;
}
async function staffReady(staff: Page) {
  await expect(staff.getByRole("button", { name: "进入工作台" })).toBeVisible();
  await staff.getByRole("button", { name: "进入工作台" }).click();
  await expect(
    staff.getByRole("heading", { name: "早安，后勤人员。" }),
  ).toBeVisible();
}
async function openTask(staff: Page) {
  await staff.getByRole("button", { name: /明理楼投影画面偏色/ }).click();
}
async function closeNode(page: Page) {
  await page.getByRole("button", { name: "关闭节点详情" }).click();
}
async function resetAll(page: Page) {
  await page.getByRole("button", { name: "恢复与直达", exact: true }).click();
  await page.getByRole("button", { name: "整场复位", exact: true }).click();
  await page.getByRole("button", { name: "确认整场复位" }).click();
}

test("完整正式流程：真实沙盘、引用拦截、页面应用、独立检查、人工证据和复位", async ({
  page,
  context,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  page.on("pageerror", (e) => errors.push(e.message));
  const remote: string[] = [];
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (
      ["http:", "https:"].includes(u.protocol) &&
      u.hostname !== "localhost"
    ) {
      remote.push(u.href);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(workbench);
  for (const id of ["image", "svg", "terrain", "standard"])
    await execute(page, id);
  const map = await openStage(page, "map");
  await expect(map.locator(".scene-shell")).toHaveAttribute(
    "data-intro-state",
    "ready",
    { timeout: 60000 },
  );
  await expect(page.getByTestId("node-map")).toHaveClass(/passed/, {
    timeout: 30000,
  });
  await map.getByRole("button", { name: "定位明理楼投影设备 · F4" }).click();
  await expect(map.getByRole("dialog")).toContainText("设施 F4 → 楼宇 B1");
  await map.getByRole("button", { name: "放大沙盘", exact: true }).click();
  await map.getByRole("button", { name: "关闭设施详情" }).click();
  await map.evaluate(() => {
    location.hash = "/bookings";
  });
  await map.locator(".record-card button").first().click();
  await expect(map.getByRole("dialog")).not.toContainText(
    /林悦|陈晨|顾宁|周然|陈越/,
  );
  await map.getByRole("button", { name: "关闭详情", exact: true }).click();
  await map.getByRole("button", { name: "定位明理楼投影设备 · F4" }).click();
  await expect(map.getByRole("dialog")).toContainText("设施 F4 → 楼宇 B1", {
    timeout: 60000,
  });

  for (const id of ["requirement", "sql-template"]) await execute(page, id);
  await execute(page, "reference");
  await expect(page.locator(".reference-box")).toContainText(
    "T1 的设施引用 F404 不存在",
  );
  await node(page, "sql");
  await expect(page.locator(".drawer-footer button")).toBeDisabled();
  await node(page, "reference");
  await page.getByRole("button", { name: "载入修正输入 S04" }).click();
  await page.locator(".drawer-footer button").click();
  await expect(page.getByTestId("node-reference")).toHaveClass(/passed/);
  await execute(page, "sql");
  const staff = await openStage(page, "template");
  await expect(page.getByTestId("node-template")).toHaveClass(/running/);
  // A self-origin forged acknowledgement must never unlock the node.
  await page.evaluate(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "http://localhost:5503",
        source: window,
        data: {
          protocol: "campus-demo-v1",
          type: "ready",
          caseId: "campus-projector-repair",
          version: "old",
          run: "old",
          stage: "template",
          requestId: "bad",
        },
      }),
    ),
  );
  await expect(page.getByTestId("node-template")).toHaveClass(/running/);
  await staffReady(staff);
  await expect(staff.getByText("通用工单结构已就绪")).toBeVisible();
  await expect(staff.getByText("明理楼投影画面偏色")).toHaveCount(0);
  await expect(page.getByTestId("node-template")).toHaveClass(/passed/);
  for (const id of ["components", "contract", "config"])
    await execute(page, id);
  await execute(page, "frontend");
  await expect(staff).toHaveURL(/stage=campus-ready/);
  await expect(staff.getByRole("button", { name: "进入工作台" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("node-frontend")).toHaveClass(/passed/);
  await staff.getByRole("combobox", { name: "设施筛选" }).selectOption("F4");
  await openTask(staff);
  await expect(staff.getByRole("dialog")).toContainText("F4 → B1");
  await staff.getByRole("button", { name: "关闭详情", exact: true }).click();
  for (const id of ["test-requirement", "test-template", "cases", "test"])
    await execute(page, id);
  await expect(page.getByTestId("node-test")).toHaveClass(/passed/);
  await openTask(staff);
  await expect(staff.getByRole("dialog")).toContainText("待处理");
  await staff.getByRole("button", { name: "领取任务", exact: true }).click();
  await staff.getByRole("button", { name: "提交处理结果" }).click();
  await expect(staff.getByRole("alert")).toContainText("请填写处理结果");
  await staff
    .getByLabel("处理结果", { exact: true })
    .fill(C01.completionResult);
  await staff.getByRole("button", { name: "提交处理结果" }).click();
  await expect(staff.getByRole("dialog")).toContainText(C01.completionResult);
  await staff.getByRole("button", { name: "关闭详情", exact: true }).click();
  await staff.getByRole("button", { name: "历史记录", exact: true }).click();
  await openTask(staff);
  await expect(staff.getByRole("dialog")).toContainText("已完成");
  // Viewing uses the existing named tab and preserves the completed record.
  await execute(page, "frontend");
  await expect(context.pages()).toHaveLength(3);
  await expect(staff.getByRole("dialog")).toContainText("已完成");
  await node(page, "manual");
  for (let i = 1; i <= 5; i++) {
    await page
      .getByLabel(`H0${i} 观察证据`)
      .fill(
        `浏览器验收：已实际验证 H0${i} 对应页面和操作；此为开发测试记录，不计真人排练。`,
      );
    await page.getByRole("button", { name: `H0${i} 登记通过` }).click();
  }
  await execute(page, "delivery");
  await expect(page.getByTestId("node-delivery")).toHaveClass(/passed/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载本轮 JSON 报告" }).click();
  const download = await downloadPromise;
  const report = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(report.automaticPassed).toBe(true);
  expect(report.manualCompleted).toBe(true);
  expect(report.deliveryReady).toBe(true);
  expect(
    report.history.some((h: any) => h.kind === "validation-rejected"),
  ).toBe(true);
  expect(JSON.stringify(report)).not.toContain("陈越");
  await closeNode(page);
  await resetAll(page);
  await expect(staff).toHaveURL(/stage=template/);
  await staffReady(staff);
  await expect(page.getByRole("button", { name: "重试页面复位" })).toHaveCount(
    0,
    { timeout: 60000 },
  );
  await expect(page.getByTestId("node-reference")).toHaveClass(/pending/);
  expect(remote).toEqual([]);
  expect(errors).toEqual([]);
});

test("成果页刷新、关闭重开、同轮身份与后勤验收复位", async ({
  page,
  context,
}) => {
  await page.goto(workbench);
  await jump(page, "校园前端");
  const staff = await openStage(page, "template");
  await staffReady(staff);
  await expect(page.getByTestId("node-template")).toHaveClass(/passed/);
  for (const id of ["components", "contract", "config", "frontend"])
    await execute(page, id);
  await expect(page.getByTestId("node-frontend")).toHaveClass(/passed/);
  await openTask(staff);
  await staff.getByRole("button", { name: "领取任务", exact: true }).click();
  await execute(page, "frontend");
  await expect(context.pages()).toHaveLength(2);
  await expect(staff.getByRole("dialog")).toContainText("处理中");
  await staff.reload();
  await expect(staff.getByRole("button", { name: "进入工作台" })).toHaveCount(
    0,
  );
  await expect(staff.getByTestId("demo-banner")).toContainText(
    "页面已刷新，业务状态已恢复",
  );
  await openTask(staff);
  await expect(staff.getByRole("dialog")).toContainText("待处理");
  await staff.getByRole("button", { name: "领取任务", exact: true }).click();
  await closeNode(page);
  await page.getByRole("button", { name: "恢复与直达", exact: true }).click();
  await page.getByRole("button", { name: "重置后勤验收" }).click();
  await expect(staff.getByRole("dialog")).toHaveCount(0);
  await openTask(staff);
  await expect(staff.getByRole("dialog")).toContainText("待处理");
  await page.keyboard.press("Escape");
  await staff.close();
  await expect(page.getByTestId("node-frontend")).toHaveClass(/stale/, {
    timeout: 4000,
  });
  const reopened = await openStage(page, "frontend");
  await staffReady(reopened);
  await expect(page.getByTestId("node-frontend")).toHaveClass(/passed/);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("工作台已刷新");
  await node(page, "image");
  await expect(page.locator(".drawer-footer button")).toBeDisabled();
});

test("真实来源的旧版本与旧轮次不能确认应用，超时后可重试", async ({ page }) => {
  await page.goto(workbench);
  await jump(page, "校园前端");
  const staff = await openStage(page, "template");
  await staff.evaluate(() => {
    const q = new URLSearchParams(location.search);
    const base = {
      protocol: "campus-demo-v1",
      type: "ready",
      caseId: "campus-projector-repair",
      version: "2026-10-09.1",
      run: q.get("run"),
      stage: "template",
      requestId: q.get("request"),
    };
    window.opener.postMessage(
      { ...base, version: "old" },
      "http://localhost:5506",
    );
    window.opener.postMessage({ ...base, run: "old" }, "http://localhost:5506");
  });
  await expect(page.getByTestId("node-template")).toHaveClass(/running/);
  await expect(page.getByTestId("node-template")).toHaveClass(/failed/, {
    timeout: 30000,
  });
  await page.getByRole("button", { name: "重新加载成果页" }).click();
  await staffReady(staff);
  await expect(page.getByTestId("node-template")).toHaveClass(/passed/);
});

for (const width of [1366, 1920])
  test(`画布交互与抽屉布局 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    await page.goto(workbench);
    await page
      .getByRole("button", { name: "01 空间产物", exact: true })
      .click();
    const before = await page.locator(".world").getAttribute("style");
    await page.getByRole("button", { name: "放大画布" }).click();
    expect(await page.locator(".world").getAttribute("style")).not.toBe(before);
    await page.getByRole("button", { name: "全图", exact: true }).click();
    const fitted = await page.locator(".world").getAttribute("style");
    await page.mouse.move(400, 680);
    await page.mouse.down();
    await page.mouse.move(490, 640);
    await page.mouse.up();
    expect(await page.locator(".world").getAttribute("style")).not.toBe(fitted);
    await node(page, "image");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "M01", exact: true }).click();
    await expect(page.locator(".material-image")).toBeVisible();
    await page.getByRole("button", { name: "增大代码字号" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.height).toBeLessThanOrEqual(width === 1920 ? 1080 : 768);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

test("非法阶段明确报错，普通后勤入口保持原登录与样例", async ({ page }) => {
  await page.goto("http://localhost:5503/?demo=1&stage=finished&run=invalid");
  await expect(page.getByRole("alert")).toContainText("演示参数无效");
  await page.goto("http://localhost:5503/");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(
    page.getByRole("heading", { name: "早安，陈越。" }),
  ).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
  await expect(page.locator(".record-card")).toHaveCount(5);
});

test("阶段重置使旧检查失效，验收阶段重置恢复 T1，预制完成态不冒充通过", async ({
  page,
}) => {
  await page.goto(workbench);
  await jump(page, "校园前端");
  const staff = await openStage(page, "template");
  await staffReady(staff);
  await expect(page.getByTestId("node-template")).toHaveClass(/passed/);
  for (const id of ["components", "contract", "config", "frontend"])
    await execute(page, id);
  await expect(page.getByTestId("node-frontend")).toHaveClass(/passed/);
  for (const id of ["test-requirement", "test-template", "cases", "test"])
    await execute(page, id);
  await expect(page.getByTestId("node-test")).toHaveClass(/passed/);
  await openTask(staff);
  await staff.getByRole("button", { name: "领取任务", exact: true }).click();
  await closeNode(page);
  await page
    .getByRole("button", { name: "05 人工验收与交付", exact: true })
    .click();
  await page.getByRole("button", { name: "恢复与直达", exact: true }).click();
  await page.getByRole("button", { name: "重置当前阶段", exact: true }).click();
  await expect(staff.getByRole("dialog")).toHaveCount(0);
  await openTask(staff);
  await expect(staff.getByRole("dialog")).toContainText("待处理");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "02 数据与引用", exact: true })
    .click();
  await page.getByRole("button", { name: "恢复与直达", exact: true }).click();
  await page.getByRole("button", { name: "重置当前阶段", exact: true }).click();
  await expect(page.getByTestId("node-test")).toHaveClass(/stale/);
  await page.keyboard.press("Escape");
  await node(page, "reference");
  await expect(page.locator(".reference-box")).toContainText("S03 · F404");
  await closeNode(page);
  await page.getByRole("button", { name: "恢复与直达", exact: true }).click();
  await page.getByRole("button", { name: "查看预制完成态" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "预制完成态 · 非本轮验收结果",
  );
  await expect(page.getByTestId("node-delivery")).not.toHaveClass(/passed/);
});
