import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Run with scripts/experience-preview.ts; manual alerts stay in its temporary schema.
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
  await page.goto("http://127.0.0.1:6179/#/alerts");
  await expect(page.getByRole("heading", { name: "告警记录" })).toBeVisible();
  const title = `浏览器人工告警${Date.now()}`;
  await page.getByRole("button", { name: "新增人工告警" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("设施").selectOption("creek");
  await editor.getByLabel("标题").fill(title);
  await editor.getByLabel("现场情况 / 原因").fill("浏览器验收：现场提示牌松动。");
  await editor.getByLabel("等级").selectOption("important");
  await editor.getByRole("button", { name: "提交" }).click();
  await expect(editor).toHaveCount(0);
  let card = page.locator(".workflow > article").filter({ hasText: title });
  await expect(card).toContainText("人工");
  await page.screenshot({ path: ".local/experience/alerts-created.png" });
  await card.getByRole("button", { name: "编辑" }).click();
  await editor.getByLabel("标题").fill(title + "已修改");
  await editor.getByRole("button", { name: "提交" }).click();
  await expect(editor).toHaveCount(0);
  card = page.locator(".workflow > article").filter({ hasText: title + "已修改" });
  await expect(card).toBeVisible();
  await page.getByLabel("归档原因").fill("浏览器验收：处理完毕");
  await card.getByRole("button", { name: "归档" }).click();
  await expect(card).toContainText("已归档");
  await card.locator("details").evaluate(element => (element.open = true));
  await expect(card).toContainText("浏览器验收：处理完毕");
  await page.screenshot({ path: ".local/experience/alerts-archived.png" });
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ passed: true, title, errors }));
} catch (error) {
  await page.screenshot({ path: ".local/experience/alerts-failure.png" }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
