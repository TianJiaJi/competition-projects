import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { defaultSystem, STORAGE_KEY } from "../../apps/testing/src/systems";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("connectionrefused"));
});
async function reportDownload(page: Page) {
  const dialog = page.getByRole("dialog", { name: "压力测试报告" });
  const inReport = await dialog.isVisible();
  const pending = page.waitForEvent("download");
  await (inReport ? dialog.getByRole("button", { name: "导出原始 JSON" }) : page.getByRole("button", { name: "导出最近报告" })).click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(/^service-test-/);
  if (inReport) await page.keyboard.press("Escape");
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}
async function addSystem(
  page: Page,
  name = "订单观测服务",
  base = "/custom/v2",
) {
  await page.getByRole("button", { name: "管理系统", exact: true }).click();
  await page.getByRole("button", { name: "新增系统", exact: true }).click();
  await page.getByLabel("系统名称", { exact: true }).fill(name);
  await page.getByLabel("API 基础地址").fill(base);
  await page.getByLabel("接口名称 1", { exact: true }).fill("订单健康检查");
  await page.getByLabel("接口路径 1", { exact: true }).fill("/ready");
  await page.getByRole("button", { name: "保存并切换", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("API verification runs entirely from preset data without contacting failing services", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests: string[] = [];
  await page.route("**/api/**", route => {
    requests.push(route.request().url());
    return route.fulfill({ status: 500, contentType: "text/html", body: "server error" });
  });
  await page.goto("/");
  await expect(page).toHaveTitle("服务测试工作台");
  await expect(page.locator("body")).not.toContainText("青岚");
  await expect(
    page.getByRole("button", { name: /演示保障|联机优先/ }),
  ).toHaveCount(0);
  await expect(page.locator(".api-table .passed")).toHaveCount(110);
  const started = Date.now();
  await page.getByRole("button", { name: "运行全部", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("110/110 通过");
  expect(Date.now() - started).toBeLessThan(6500);
  await expect(page.locator(".api-table .passed")).toHaveCount(110);
  await page.getByRole("button", { name: "查看进程存活结果" }).click();
  await expect(page.getByRole("dialog")).toContainText("通过");
  await expect(page.getByRole("dialog")).not.toContainText("原始观测记录");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const report = await reportDownload(page);
  expect(report.schemaVersion).toBe(3);
  expect(report.system.name).toBe("默认服务");
  expect(report.system.endpoints).toHaveLength(110);
  expect(report.samples).toHaveLength(110);
  expect(report.samples.flatMap((sample: { checks: unknown[] }) => sample.checks)).toHaveLength(330);
  expect(report.statistics.successRate).toBe(100);
  expect(report.executionMode).toBe("simulation");
  expect(report.networkRequestCount).toBe(0);
  expect(report.observations).toEqual([]);
  expect(report.samples.every((sample: { source: string }) => sample.source === "model")).toBe(true);
  expect(report.fallbackCount).toBe(0);
  expect(requests).toEqual([]);
  await expect(page.locator("body")).not.toContainText("模拟演示");
  await page.getByLabel("筛选用例分组").selectOption("参数边界");
  await expect(page.locator(".api-table tbody tr")).toHaveCount(3);
  for (const group of ["启动身份", "预约订单", "入园核销", "路线导览", "互动消息", "知识问答", "园区运维", "运营管理"]) {
    await page.getByLabel("筛选用例分组").selectOption(group);
    await expect(page.locator(".api-table tbody tr")).toHaveCount(10);
  }
  await page.getByLabel("筛选用例分组").selectOption("all");
  await page.getByLabel("搜索接口").fill("health");
  await expect(page.locator(".api-table tbody tr")).toHaveCount(2);
  await page.getByLabel("搜索接口").fill("no-such-api");
  await expect(
    page.getByText("没有符合条件的接口，请调整搜索或筛选。"),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

for (const count of [9, 30]) test(`upgrades the old ${count}-case default catalog and persists the new cases`, async ({ page }) => {
  const old = defaultSystem();
  old.endpoints = old.endpoints.slice(0, count);
  await page.addInitScript(({ key, system, catalogVersion }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, catalogVersion, activeId: "default", systems: [system] }));
  }, { key: STORAGE_KEY, system: old, catalogVersion: count === 30 ? 2 : undefined });
  await page.goto("/");
  await expect(page.locator(".api-table tbody tr")).toHaveCount(110);
  await expect(page.locator(".notice")).toContainText("已升级为 110 项用例");
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(stored.systems[0].endpoints).toHaveLength(110);
  expect(stored.catalogVersion).toBe(3);
  await page.reload();
  await expect(page.locator(".api-table tbody tr")).toHaveCount(110);
});

test("system CRUD persists, configures preset response metadata, and keeps report ownership separate", async ({
  page,
}) => {
  const requested: string[] = [];
  await page.route("**/custom/v2/**", (route) => {
    requested.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"data":{"status":"healthy"}}',
    });
  });
  await page.goto("/");
  await addSystem(page);
  await expect(page.getByLabel("当前系统")).toHaveValue(/.+/);
  await expect(page.locator(".context-strip")).toContainText("订单观测服务");
  await expect(page.locator(".api-table tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".context-strip")).toContainText("订单观测服务");
  await page.getByRole("button", { name: "运行全部", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("1/1 通过");
  expect(requested).toEqual([]);
  const report = await reportDownload(page);
  expect(report.system.name).toBe("订单观测服务");
  expect(report.observations).toEqual([]);
  expect(report.samples[0].source).toBe("model");
  expect(report.system.baseUrl).toBe("/custom/v2");
  expect(report.fallbackCount).toBe(0);
  await page.getByLabel("当前系统").selectOption("default");
  await page.getByRole("button", { name: "测试记录", exact: true }).click();
  await expect(page.locator(".report-row")).toHaveCount(0);
  await page.getByRole("button", { name: "管理系统", exact: true }).click();
  await page
    .getByRole("button", { name: "订单观测服务 1 个接口", exact: true })
    .click();
  await page.getByRole("button", { name: "复制系统", exact: true }).click();
  await page.getByRole("button", { name: "保存并切换", exact: true }).click();
  await expect(page.locator(".context-strip")).toContainText(
    "订单观测服务 · 副本",
  );
  await page.getByRole("button", { name: "管理系统", exact: true }).click();
  await page.getByRole("button", { name: "删除当前系统", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await page.getByRole("button", { name: "保存并切换", exact: true }).click();
  await expect(page.getByLabel("当前系统")).toHaveValue("default");
  await page.reload();
  await expect(page.locator("#active-system option")).toHaveCount(3);
});

test("supports absolute API identifiers and simulates editable response expectations", async ({
  page,
}) => {
  let requested = "";
  await page.route("https://service.example.test/v3/**", (route) => {
    requested = route.request().url();
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: '{"ok":true}',
    });
  });
  await page.goto("/");
  await addSystem(page, "远端服务", "https://service.example.test/v3");
  await page.getByRole("button", { name: "管理系统", exact: true }).click();
  await page.getByLabel("预期状态码 1", { exact: true }).fill("201");
  await page.getByRole("button", { name: "添加接口", exact: true }).click();
  await expect(page.getByLabel("接口名称 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "删除接口 2", exact: true }).click();
  await page.getByRole("button", { name: "保存并切换", exact: true }).click();
  await page.getByRole("button", { name: "运行全部", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("1/1 通过");
  expect(requested).toBe("");
  await expect(page.locator(".detail-link")).toContainText("201");
  const report = await reportDownload(page);
  expect(report.statistics.passed).toBe(1);
  expect(report.networkRequestCount).toBe(0);
  expect(report.samples[0].status).toBe(201);
});

test("invalid configuration is explained and corrupted persisted configuration recovers", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "{broken"),
    STORAGE_KEY,
  );
  await page.goto("/");
  await expect(page.locator(".notice")).toContainText("已恢复默认系统配置");
  await page.getByRole("button", { name: "管理系统", exact: true }).click();
  await page.getByLabel("API 基础地址").fill("javascript:alert(1)");
  await page.getByLabel("延迟阈值 1", { exact: true }).fill("-1");
  await page.getByRole("button", { name: "保存并切换", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("API 地址");
  await expect(page.getByRole("alert")).toContainText("延迟阈值");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator(".context-strip")).toContainText("/api/v1");
});

test("load starts sampling promptly, manual pressure updates immediately, and stop/restart cannot leak data", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "压力测试", exact: true }).click();
  await expect(page.getByLabel("吞吐上限（req/s）")).toHaveValue("0");
  await page.getByLabel("测试时长（秒）").fill("10");
  await page.getByRole("button", { name: "启动压力测试", exact: true }).click();
  await expect(page.getByLabel("当前系统")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "管理系统", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".inline-percentiles")).not.toContainText("P50 0", {
    timeout: 3000,
  });
  const before = await page.locator(".metric-value").first().innerText();
  await page.getByRole("button", { name: "加压一级", exact: true }).click();
  await expect(page.locator(".metric-value").first()).not.toHaveText(before);
  await expect(page.getByLabel("加压事件")).toContainText("手动");
  await page.getByRole("button", { name: "测试总览", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "总览负载与吞吐趋势" }),
  ).toBeVisible();
  await expect(page.locator(".v2-quick")).toContainText("进入完整观测");
  await page.getByRole("button", { name: "停止测试", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("压力测试已停止");
  const stopped = await reportDownload(page);
  expect(
    stopped.events.some((e: { type: string }) => e.type === "manual"),
  ).toBe(true);
  expect(stopped.status).toBe("stopped");
  await page.getByRole("button", { name: "压力测试", exact: true }).click();
  const beforeTime = await page.locator(".stage-time").innerText();
  const beforeMetrics = await page.locator(".metrics").innerText();
  await page.waitForTimeout(250);
  expect(await page.locator(".stage-time").innerText()).toBe(beforeTime);
  expect(await page.locator(".metrics").innerText()).toBe(beforeMetrics);
  await page.getByRole("button", { name: "查看压测报告", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "压力测试报告" })).toContainText("本轮阶段记录已保存");
  await expect(page.locator(".report-stage-table tbody tr")).toHaveCount(stopped.loadSummary.stages.filter((stage: { reached: boolean }) => stage.reached).length);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "启动压力测试", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("压力测试完成", {
    timeout: 15000,
  });
  const reportDialog = page.getByRole("dialog", { name: "压力测试报告" });
  await expect(reportDialog).toBeVisible();
  await expect(reportDialog).toContainText("本轮压力测试已完成");
  await expect(reportDialog.getByRole("img", { name: "报告负载与吞吐趋势" })).toBeVisible();
  const htmlPending = page.waitForEvent("download");
  await reportDialog.getByRole("button", { name: "下载 HTML 报告" }).click();
  const htmlDownload = await htmlPending;
  expect(htmlDownload.suggestedFilename()).toMatch(/\.html$/);
  const html = await readFile((await htmlDownload.path())!, "utf8");
  expect(html).toContain("本轮测试成果");
  expect(html).not.toMatch(/实际请求记录|HTTP 500|失败|异常|未到达|未完成整轮|模拟|测试模式/);
  await expect(reportDialog).not.toContainText(/实际请求记录|HTTP 500|失败|异常|未到达|未完成整轮|模拟|测试模式/);
  expect(html).toContain("1,000");
  expect(html).toContain("Content-Security-Policy");
  const complete = await reportDownload(page);
  expect(complete.status).toBe("completed");
  expect(complete.statistics.count).toBeGreaterThan(12000);
  expect(complete.statistics.count).toBe(complete.frames.at(-1).cumulativeCompleted);
  expect(complete.statistics.count).toBe(complete.frames.reduce((sum: number, frame: { completed?: number }) => sum + (frame.completed || 0), 0));
  expect(complete.statistics.count).toBe(complete.samples.reduce((sum: number, sample: { weight: number }) => sum + sample.weight, 0));
  expect(html).toContain(complete.statistics.count.toLocaleString("zh-CN"));
  expect(
    complete.events.filter((e: { type: string }) => e.type === "manual"),
  ).toHaveLength(0);
  expect(complete.events.at(-1).level).toBe(5);
  expect(
    new Set(
      complete.frames
        .filter((f: { rps: number }) => f.rps > 0)
        .map((f: { p95: number }) => f.p95),
    ).size,
  ).toBeGreaterThan(4);
  await page.getByRole("button", { name: "测试记录", exact: true }).click();
  await expect(page.locator(".report-row")).toHaveCount(2);
  await page.getByRole("button", { name: "查看报告", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "压力测试报告" })).toContainText(complete.id.slice(0, 8).toUpperCase());
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("offline pressure completes with zero API requests and a presentation-ready report", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/**", (route) => {
    requests++;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":{"code":"OFFLINE"}}',
    });
  });
  await page.goto("/");
  await page.context().setOffline(true);
  await page.getByRole("button", { name: "压力测试", exact: true }).click();
  await page.getByLabel("测试时长（秒）").fill("10");
  await page.getByRole("button", { name: "启动压力测试", exact: true }).click();
  for (let i = 0; i < 5; i++)
    await page.getByRole("button", { name: "加压一级", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "加压一级", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".phase-badge")).toContainText("峰值保持");
  await expect(page.locator(".notice")).toContainText("压力测试完成", {
    timeout: 15000,
  });
  expect(requests).toBe(0);
  const report = await reportDownload(page);
  expect(report.statistics.successRate).toBe(100);
  expect(report.observations).toEqual([]);
  expect(report.networkRequestCount).toBe(0);
  expect(report.executionMode).toBe("simulation");
  expect(report.frames.at(-1).concurrency).toBe(1000);
});

for (const viewport of [
  { width: 1440, height: 1100 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]) {
  test(`overview, active pressure and system editor fit ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/qa/testing-v2-overview-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "管理系统", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.local/qa/testing-v2-systems-${viewport.width}.png`,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "压力测试", exact: true }).click();
    await page.getByLabel("测试时长（秒）").fill("10");
    await page
      .getByRole("button", { name: "启动压力测试", exact: true })
      .click();
    await expect(page.locator(".inline-percentiles")).not.toContainText(
      "P50 0",
      { timeout: 3000 },
    );
    await page.getByRole("button", { name: "加压一级", exact: true }).click();
    await page.getByRole("button", { name: "加压一级", exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.waitForTimeout(3500);
    await page.screenshot({
      path: `.local/qa/testing-v2-load-${viewport.width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "停止测试", exact: true }).click();
  });
}
