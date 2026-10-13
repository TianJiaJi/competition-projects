import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Run with scripts/experience-preview.ts so account writes use a temporary schema.
await mkdir(".local/experience", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const failures = [];
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => {
  if (response.url().includes("/api/v1/") && response.status() >= 400)
    failures.push(`${response.status()} ${response.url()}`);
});
try {
  await page.goto("http://127.0.0.1:6179/");
  await page.locator("#username").fill("admin01");
  await page.locator("#password").fill("123456");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("工作台", { exact: true }).first()).toBeVisible();
  await page.goto("http://127.0.0.1:6179/#/users/staff");
  await expect(page.getByRole("heading", { name: "员工管理" })).toBeVisible();
  const trade = `巡检验收${Date.now()}`;
  await page.getByLabel("新工种名称").fill(trade);
  await page.getByRole("button", { name: "添加工种" }).click();
  await expect(page.locator(".people-trades")).toContainText(trade);
  await page.screenshot({ path: ".local/experience/people-staff.png" });
  const username = `staffcheck${Date.now()}`;
  await page.getByRole("button", { name: "创建账号" }).click();
  let editor = page.getByRole("dialog", { name: "创建账号" });
  await editor.getByLabel("登录账号").fill(username);
  await editor.getByLabel("显示名称").fill("浏览器验收员工");
  await editor.getByLabel(trade).check();
  await editor.getByLabel("区域 Z1").check();
  await editor.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("dialog", { name: "临时密码" })).toBeVisible();
  await expect(page.locator(".temporary-password")).not.toBeEmpty();
  await page.getByRole("button", { name: "已保存，关闭" }).click();
  await page.getByLabel("搜索账号").fill(username);
  const row = page.locator(".people-table tr").filter({ hasText: username });
  await expect(row).toContainText("浏览器验收员工");
  await expect(row).toContainText(trade);
  await expect(row).toContainText("Z1");
  await row.getByRole("button", { name: "编辑" }).click();
  editor = page.getByRole("dialog", { name: "编辑账号" });
  await editor.getByLabel("显示名称").fill("浏览器验收员工已改");
  await editor.getByRole("button", { name: "保存" }).click();
  await expect(row).toContainText("浏览器验收员工已改");
  await row.getByRole("button", { name: "活动详情" }).click();
  await expect(page.getByRole("dialog", { name: /浏览器验收员工已改 · 活动记录/ })).toBeVisible();
  await page.getByRole("dialog", { name: /活动记录/ }).getByRole("button", { name: "关闭" }).click();
  await row.getByRole("button", { name: "归档" }).click();
  await page.getByRole("button", { name: "归档", exact: true }).last().click();
  await expect(row).toContainText("已归档");
  await page.screenshot({ path: ".local/experience/people-staff-after.png" });
  await page.goto("http://127.0.0.1:6179/#/users/visitors");
  await expect(page.getByRole("heading", { name: "游客管理" })).toBeVisible();
  const visitorUsername = `visitorcheck${Date.now()}`;
  await page.getByRole("button", { name: "创建账号" }).click();
  editor = page.getByRole("dialog", { name: "创建账号" });
  await editor.getByLabel("登录账号").fill(visitorUsername);
  await editor.getByLabel("显示名称").fill("浏览器验收游客");
  await editor.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("dialog", { name: "临时密码" })).toBeVisible();
  await page.getByRole("button", { name: "已保存，关闭" }).click();
  await page.getByLabel("搜索账号").fill(visitorUsername);
  const visitorRow = page.locator(".people-table tr").filter({ hasText: visitorUsername });
  await expect(visitorRow).toContainText("浏览器验收游客");
  await visitorRow.getByRole("button", { name: "归档" }).click();
  await page.getByRole("button", { name: "归档", exact: true }).last().click();
  await expect(visitorRow).toContainText("已归档");
  await page.screenshot({ path: ".local/experience/people-visitor-after.png" });
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
  console.log(JSON.stringify({ passed: true, trade, username, visitorUsername, errors, failures }));
} catch (error) {
  await page.screenshot({ path: ".local/experience/people-failure.png" }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
