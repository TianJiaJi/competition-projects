import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { scenarios, type ScenarioId } from "../../apps/testing/src/special-engine";
import { defaultSystem, STORAGE_KEY } from "../../apps/testing/src/systems";

async function open(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "专项验证", exact: true }).click();
}
async function complete(page: Page, id: ScenarioId) {
  const scenario = scenarios.find(item => item.id === id)!;
  await page.getByRole("button", { name: scenario.name, exact: true }).click();
  for (const action of scenario.actions) await page.getByRole("button", { name: action, exact: true }).click();
  await expect(page.locator(".scenario-verdict")).toContainText("验证通过");
}
async function download(page: Page, name = "导出原始 JSON") {
  const pending = page.waitForEvent("download");
  await page.getByRole("dialog", { name: "专项验收报告" }).getByRole("button", { name, exact: true }).click();
  return await readFile((await (await pending).path())!, "utf8");
}

test("six manual scenarios work offline, expose evidence and export consistent full reports", async ({ page }) => {
  const errors: string[] = [], requests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (["fetch", "xhr"].includes(request.resourceType())) requests.push(request.url()); });
  await open(page);
  await page.context().setOffline(true);
  await expect(page.getByRole("button", { name: "生成专项验收报告", exact: true })).toBeDisabled();
  for (const scenario of scenarios) await complete(page, scenario.id);
  await expect(page.locator(".special-summary")).toContainText("6 / 6");
  await expect(page.locator(".special-summary")).toContainText("18 / 18");
  await page.getByRole("button", { name: "多账户抢单", exact: true }).click();
  await page.locator(".ledger-entry").nth(1).click();
  const detail = page.getByRole("dialog", { name: "请求处理详情" });
  await expect(detail).toContainText("业务状态前后对照");
  await expect(detail).toContainText("请求输入");
  await expect(detail).toContainText("处理响应");
  await expect(detail).toContainText("expectedVersion");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "生成专项验收报告", exact: true }).click();
  const report = page.getByRole("dialog", { name: "专项验收报告" });
  await expect(report).toContainText("六项专项验证已完成");
  await expect(report.locator(".special-report-case")).toHaveCount(6);
  const html = await download(page, "下载 HTML 报告");
  const raw = JSON.parse(await download(page));
  expect(raw).toMatchObject({ schemaVersion: 3, kind: "special", executionMode: "simulation", networkRequestCount: 0, status: "completed" });
  expect(raw.summary).toMatchObject({ completed: 6, assertions: 18, passed: 18 });
  expect(raw.scenarios.every((run: { step: number }) => run.step === 3)).toBe(true);
  expect(html).toContain("六项专项验证已完成");
  expect(html).not.toMatch(/模拟|测试模式|<script/);
  for (const scenario of scenarios) expect(html).toContain(scenario.name);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "重新运行", exact: true }).click();
  await page.getByRole("button", { name: "测试记录", exact: true }).click();
  await expect(page.locator(".report-row")).toHaveCount(1);
  await expect(page.locator(".report-row")).toContainText("专项验收报告");
  await expect(page.locator(".report-row")).toContainText("6 / 6");
  await expect(page.locator(".report-row")).not.toContainText("P95");
  await page.getByRole("button", { name: "查看报告", exact: true }).click();
  await expect(report).toContainText("六项专项验证已完成");
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("partial progress survives navigation, parameters reset one case, system changes clear drafts", async ({ page }) => {
  const first = defaultSystem(), second = { ...defaultSystem(), id: "other", name: "另一系统" };
  await page.addInitScript(({ key, first, second }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, catalogVersion: 2, activeId: first.id, systems: [first, second] }));
  }, { key: STORAGE_KEY, first, second });
  await open(page);
  await complete(page, "claim");
  await page.getByRole("button", { name: "库存防超卖", exact: true }).click();
  await page.getByRole("button", { name: "准备最后一份库存", exact: true }).click();
  await expect(page.getByRole("button", { name: "并发提交订单", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: /^API 验证/ }).click();
  await page.getByRole("button", { name: "专项验证", exact: true }).click();
  await expect(page.getByRole("button", { name: "并发提交订单", exact: true })).toBeEnabled();
  await page.getByLabel("场景参数").selectOption("5");
  await expect(page.getByRole("button", { name: "准备最后一份库存", exact: true })).toBeEnabled();
  await expect(page.locator(".request-token")).toHaveCount(0);
  await page.getByRole("button", { name: "生成专项验收报告", exact: true }).click();
  const report = page.getByRole("dialog", { name: "专项验收报告" });
  await expect(report).toContainText("已核验 1 项专项场景");
  await expect(report.locator(".special-report-case")).toHaveCount(1);
  const raw = JSON.parse(await download(page));
  expect(raw.scenarios.find((run: { scenarioId: string }) => run.scenarioId === "stock")).toMatchObject({ step: 0, parameter: "5" });
  await page.keyboard.press("Escape");
  await page.getByLabel("当前系统").selectOption("other");
  await expect(page.locator(".special-summary")).toContainText("0 / 6");
  await page.getByRole("button", { name: "测试记录", exact: true }).click();
  await expect(page.locator(".report-row")).toHaveCount(0);
  await page.getByLabel("当前系统").selectOption("default");
  await expect(page.locator(".report-row")).toHaveCount(1);
  await page.getByRole("button", { name: "专项验证", exact: true }).click();
  await expect(page.locator(".special-summary")).toContainText("0 / 6");
});

test("active actions block repeated execution, configuration changes and other test runners", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "库存防超卖", exact: true }).click();
  await page.getByRole("button", { name: "准备最后一份库存", exact: true }).click();
  await page.getByRole("button", { name: "并发提交订单", exact: true }).click();
  await expect(page.getByLabel("场景参数")).toBeDisabled();
  await expect(page.getByLabel("当前系统")).toBeDisabled();
  await expect(page.getByRole("button", { name: "重新运行", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "正在处理…", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /^API 验证/ }).click();
  await expect(page.getByRole("button", { name: "运行全部", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "专项验证", exact: true }).click();
  await expect(page.getByRole("button", { name: "核验成交与库存", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "核验成交与库存", exact: true }).click();
  await expect(page.locator(".scenario-verdict")).toContainText("成交笔数 1");
  await expect(page.locator(".request-token")).toHaveCount(20);
  await page.getByRole("button", { name: "压力测试", exact: true }).click();
  await page.getByLabel("测试时长（秒）").fill("10");
  await page.getByRole("button", { name: "启动压力测试", exact: true }).click();
  await page.getByRole("button", { name: "专项验证", exact: true }).click();
  await expect(page.getByRole("button", { name: "生成专项验收报告", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "重新运行", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "停止测试", exact: true }).click();
  await expect(page.getByRole("button", { name: "重新运行", exact: true })).toBeEnabled();
});

test("stock winner stays visible and request scroll resets on every rerun", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  // Seed 77 awards the 20-account batch to account N, outside the old first four cards.
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "getRandomValues", { value: (values: Uint32Array) => { values.fill(77); return values; } });
  });
  await open(page);
  await complete(page, "stock");
  const grid = page.locator(".request-grid");
  const winner = page.locator(".request-token.accepted");
  await expect(winner).toHaveCount(1);
  await expect(winner).toContainText("账户 N");
  await expect(winner).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".request-success")).toContainText("账户 N · 下单成功");
  await page.locator(".request-success").click();
  await expect(page.getByRole("dialog", { name: "请求处理详情" })).toContainText("下单成功");
  await page.keyboard.press("Escape");

  for (const count of [20, 10, 5]) {
    await grid.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await grid.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    // The successful result is still accessible while the account cards are scrolled.
    await expect(page.locator(".request-success")).toBeInViewport({ ratio: 1 });
    if (count === 20) await page.getByRole("button", { name: "重新运行", exact: true }).click();
    else await page.getByLabel("场景参数").selectOption(String(count));
    await expect(page.locator(".request-success")).toHaveCount(0);
    await expect(page.locator(".business-metrics")).toContainText("剩余库存1");
    await complete(page, "stock");
    await expect(page.locator(".request-token")).toHaveCount(count);
    await expect(winner).toHaveCount(1);
    await expect(winner).toBeInViewport({ ratio: 1 });
    expect(await grid.evaluate(element => element.scrollTop)).toBe(0);
    await expect(page.locator(".scenario-verdict")).toContainText("成交笔数 1");
  }
  await page.screenshot({ path: ".local/qa/stock-winner-visible.png", fullPage: true });
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test(`special console, evidence and report fit ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width >= 1366) {
      const box = await page.locator(".scenario-next").boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    await complete(page, "claim");
    await page.screenshot({ path: `.local/qa/special-console-${viewport.width}.png`, fullPage: true });
    await page.locator(".ledger-entry").nth(1).click();
    expect(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `.local/qa/special-evidence-${viewport.width}.png`, fullPage: true });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "生成专项验收报告", exact: true }).click();
    expect(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `.local/qa/special-report-${viewport.width}.png`, fullPage: true });
  });
}
