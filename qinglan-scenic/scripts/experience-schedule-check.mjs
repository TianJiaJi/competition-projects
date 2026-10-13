import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Run with scripts/experience-preview.ts; custom quotas are written to its temporary schema.
await mkdir(".local/experience", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto("http://127.0.0.1:6179/");
  await page.locator("#username").fill("admin01");
  await page.locator("#password").fill("123456");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("工作台", { exact: true }).first()).toBeVisible();
  await page.goto("http://127.0.0.1:6179/#/booking/slots");
  await page.getByRole("button", { name: "自定义预约日程" }).click();
  const editor = page.getByRole("dialog", { name: "自定义日期与时段" });
  await expect(editor).toBeVisible();
  await editor.getByLabel("起始日期").fill("2026-10-01");
  await editor.getByLabel("起始日期").dispatchEvent("change");
  await editor.getByLabel("结束日期").fill("2026-10-01");
  await page.waitForTimeout(200);
  while (await editor.locator(".schedule-row").count() > 1)
    await editor.locator(".schedule-row").last().getByRole("button", { name: "移除" }).click();
  if (!(await editor.locator(".schedule-row").count())) await editor.getByRole("button", { name: "添加时段" }).click();
  const slot = editor.locator(".schedule-row").first();
  await slot.getByLabel("开始时刻").fill("08:15");
  await slot.getByLabel("结束时刻").fill("09:45");
  await slot.getByLabel("配额").fill("50");
  await editor.screenshot({ path: ".local/experience/schedule-editor.png" });
  await editor.getByRole("button", { name: "添加时段" }).click();
  const overlap = editor.locator(".schedule-row").last();
  await overlap.getByLabel("开始时刻").fill("09:00");
  await overlap.getByLabel("结束时刻").fill("10:00");
  await editor.getByRole("button", { name: "保存日程" }).click();
  await expect(editor.getByRole("alert")).toContainText("预约时段不能重叠");
  await overlap.getByRole("button", { name: "移除" }).click();
  await editor.getByRole("button", { name: "保存日程" }).click();
  await expect(editor).toHaveCount(0);
  await page.locator("#slot-date").fill("2026-10-01");
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page.locator(".data-table")).toContainText("08:15—09:45");
  await expect(page.locator(".data-table")).toContainText("50");
  await page.screenshot({ path: ".local/experience/schedule-after.png" });
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, errors }));
} catch (error) {
  await page.screenshot({ path: ".local/experience/schedule-failure.png" }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
