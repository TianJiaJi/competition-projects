import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { defaultSystem, STORAGE_KEY } from "../../apps/testing/src/systems";
import { campusSystem } from "../../apps/testing/src/service-catalog";

async function manager(page: Page) {
  await page.getByRole("button", { name: "管理系统", exact: true }).click();
}
async function discovery(page: Page) {
  await page.getByRole("button", { name: "服务发现", exact: true }).click();
}
async function scan(page: Page) {
  await page.getByRole("button", { name: "发现并接入新服务", exact: true }).click();
  await expect(page.locator(".discovery-message")).toContainText("已自动接入 3 个新平台");
}
test("campus catalog migrates beside existing configuration and runs 110 grouped contracts offline", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (["fetch", "xhr"].includes(request.resourceType())) requests.push(request.url()); });
  await page.addInitScript(({ key, system }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, catalogVersion: 2, activeId: "default", systems: [system] }));
  }, { key: STORAGE_KEY, system: defaultSystem() });
  await page.goto("/");
  await manager(page);
  await page.locator(".system-choice").filter({ hasText: "智慧校园" }).click();
  await expect(page.locator(".system-provenance")).toContainText("智慧校园一体化解决方案");
  await expect(page.locator(".endpoint-editor-row")).toHaveCount(110);
  await page.getByRole("button", { name: "后勤工单 15", exact: true }).click();
  await expect(page.locator(".endpoint-editor-row")).toHaveCount(15);
  await expect(page.getByLabel("接口路径 17", { exact: true })).toHaveValue("/work-orders/T1");
  await page.getByRole("button", { name: "保存并切换", exact: true }).click();
  await expect(page.getByLabel("当前系统")).toHaveValue("smart-campus");
  await expect(page.locator(".api-table tbody tr")).toHaveCount(110);
  await page.context().setOffline(true);
  const started = Date.now();
  await page.getByRole("button", { name: "运行全部", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("110/110 通过");
  expect(Date.now() - started).toBeLessThan(6500);
  for (const [group, count] of [["平台基础", 15], ["校园空间", 15], ["设施运维", 15], ["后勤工单", 15], ["教学服务", 15], ["权限审计", 15], ["生活服务", 10], ["安全巡检", 10]] as const) {
    await page.getByLabel("筛选用例分组").selectOption(group);
    await expect(page.locator(".api-table tbody tr")).toHaveCount(count);
  }
  await page.getByLabel("筛选用例分组").selectOption("all");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出最近报告", exact: true }).click();
  const report = JSON.parse(await readFile((await (await pending).path())!, "utf8"));
  expect(report.system.id).toBe("smart-campus");
  expect(report.system.endpoints).toHaveLength(110);
  expect(report.samples).toHaveLength(110);
  expect(report.samples.flatMap((sample: { checks: unknown[] }) => sample.checks)).toHaveLength(330);
  expect(report.statistics.passed).toBe(110);
  expect(report.networkRequestCount).toBe(0);
  expect(requests).toEqual([]);
  await page.context().setOffline(false);
  await page.reload();
  await expect(page.getByLabel("当前系统")).toHaveValue("smart-campus");
});

test("saved thirty-case campus catalogs upgrade to 110 and remain upgraded after reload", async ({ page }) => {
  const campus = campusSystem(); campus.endpoints = campus.endpoints.slice(0, 30);
  await page.addInitScript(({ key, systems }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, catalogVersion: 3, serviceCatalogVersion: 1, activeId: "smart-campus", systems }));
  }, { key: STORAGE_KEY, systems: [defaultSystem(), campus] });
  await page.goto("/");
  await expect(page.locator(".notice")).toContainText("智慧校园 API 验收目录已升级为 110 项用例");
  await expect(page.locator(".api-table tbody tr")).toHaveCount(110);
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
  expect(saved.serviceCatalogVersion).toBe(2);
  expect(saved.systems[1].endpoints).toHaveLength(110);
  await page.reload();
  await expect(page.getByLabel("当前系统")).toHaveValue("smart-campus");
  await expect(page.locator(".api-table tbody tr")).toHaveCount(110);
});

test("service discovery imports and persists three local manifests without duplicate registrations or network requests", async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on("request", request => { if (["fetch", "xhr"].includes(request.resourceType())) requests.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/"); await page.context().setOffline(true);
  await manager(page); await discovery(page);
  await expect(page.locator(".platform-card")).toHaveCount(0);
  await page.getByRole("button", { name: "发现并接入新服务", exact: true }).click();
  await expect(page.getByRole("button", { name: "正在识别服务…", exact: true })).toBeDisabled();
  await expect(page.locator(".system-choice").first()).toBeDisabled();
  await expect(page.locator(".discovery-message")).toContainText("已自动接入 3 个新平台");
  await expect(page.locator(".platform-card.registered")).toHaveCount(3);
  await expect(page.locator(".system-choice")).toHaveCount(5);
  await expect(page.locator(".discovery-metrics")).toContainText("36");
  await page.getByRole("button", { name: "重新扫描", exact: true }).click();
  await expect(page.locator(".discovery-message")).toContainText("本轮未新增服务");
  await expect(page.locator(".system-choice")).toHaveCount(5);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("当前系统", { exact: true }).selectOption("campus-logistics");
  await page.getByRole("button", { name: "运行全部", exact: true }).click();
  await expect(page.locator(".notice")).toContainText("12/12 通过");
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出最近报告", exact: true }).click();
  const raw = JSON.parse(await readFile((await (await pending).path())!, "utf8"));
  expect(raw.system.registration).toMatchObject({ source: "discovery", manifestId: "campus-logistics", dataSource: "local-manifest" });
  expect(raw.samples).toHaveLength(12);
  expect(raw.networkRequestCount).toBe(0);
  expect(requests).toEqual([]); expect(errors).toEqual([]);
  await page.context().setOffline(false); await page.reload();
  await expect(page.locator("#active-system option")).toHaveCount(5);
  await expect(page.getByLabel("当前系统")).toHaveValue("campus-logistics");
});

test("closing an unfinished scan cancels registration; automatic intake does not save unrelated draft edits", async ({ page }) => {
  await page.goto("/"); await manager(page); await discovery(page);
  await page.getByRole("button", { name: "发现并接入新服务", exact: true }).click();
  await expect(page.locator(".platform-card")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForTimeout(4200);
  await expect(page.locator("#active-system option")).toHaveCount(2);
  await manager(page);
  await page.getByLabel("系统名称", { exact: true }).fill("尚未保存的修改");
  await discovery(page); await scan(page);
  await page.keyboard.press("Escape");
  await manager(page);
  await expect(page.getByLabel("系统名称", { exact: true })).toHaveValue("默认服务");
  await expect(page.locator(".system-choice")).toHaveCount(5);
});

for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 390, height: 844 }]) {
  test(`service catalog and discovery fit ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport); await page.goto("/"); await manager(page);
    await page.locator(".system-choice").filter({ hasText: "智慧校园" }).click();
    const dialog = page.getByRole("dialog", { name: "管理被测系统" });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: `.local/qa/campus-catalog-${viewport.width}.png`, fullPage: true });
    await discovery(page); await scan(page);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "返回系统配置", exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: `.local/qa/service-discovery-${viewport.width}.png`, fullPage: true });
  });
}
