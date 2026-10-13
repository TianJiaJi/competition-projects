import { expect, type Page } from "@playwright/test";

export const DEMO = { username: "admin_demo", password: "AdminDemo123!" };

export async function login(page: Page): Promise<void> {
  await page.goto("/#/login");
  await page.locator("#username").fill(DEMO.username);
  await page.locator("#password").fill(DEMO.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
}

export async function gotoPage(page: Page, path: string, heading: string | RegExp): Promise<void> {
  await page.goto(path.startsWith("#") ? `/${path}` : `/#${path}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

export async function closeDrawer(page: Page): Promise<void> {
  await page.locator(".drawer").getByRole("button", { name: "关闭" }).first().click();
}
