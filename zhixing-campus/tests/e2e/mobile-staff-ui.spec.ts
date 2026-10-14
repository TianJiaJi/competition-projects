import { expect, test } from "@playwright/test";
import { scenario } from "../../scenario/config";
import { createBookingServer } from "../../scripts/booking-service.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
let server: Server;
let directory: string;
test.beforeEach(async ({ page }) => {
  directory = mkdtempSync(join(tmpdir(), "campus-layout-"));
  server = createBookingServer({ dataFile: join(directory, "bookings.json") });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试服务未启动");
  await page.route("**/api/bookings/**", async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:${address.port}${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
});
test.afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
});
const mobileUrl = `http://localhost:${process.env.E2E_MOBILE_PORT || scenario.ports.mobile}`;
const staffUrl = `http://localhost:${process.env.E2E_STAFF_PORT || scenario.ports.staff}`;
async function noHorizontalOverflow(page: import("@playwright/test").Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const width of [360, 390, 430]) {
  test(`学生预约与教师工作台 ${width}px：无默认教室选择器和横向裁切`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${mobileUrl}/#/pages/booking/index`);
    await expect(page.locator(".venue-option")).toHaveCount(6);
    await expect(page.locator("uni-picker")).toHaveCount(0);
    await expect(page.locator(".slot-option")).toHaveCount(8);
    await expect(page.locator(".slot-option").first()).toBeVisible();
    await noHorizontalOverflow(page);
    if (width === 390) await page.screenshot({ path: "test-results/campus-student-booking-390.png", fullPage: true });
    await page.goto(staffUrl);
    await page.getByRole("button", { name: "进入工作台" }).click();
    await expect(page.getByRole("heading", { name: "教学工作台" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "教学工作台" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "页面导航" }).getByRole("button")).toHaveCount(4);
    await expect(page.getByText("明理楼投影画面偏色")).toHaveCount(0);
    await noHorizontalOverflow(page);
    if (width === 390) await page.screenshot({ path: "test-results/campus-teacher-dashboard-390.png" });
    await page.getByRole("button", { name: "教学", exact: true }).click();
    await page.getByRole("button", { name: "学生信息", exact: true }).click();
    await page.getByRole("textbox", { name: "搜索学生" }).fill("林悦");
    await page.locator(".teacher-card").filter({ hasText: "林悦" }).click();
    await expect(page.getByRole("dialog")).toContainText("2024010101");
    await expect(page.locator(".staff-detail .drawer")).toHaveCSS("width", `${width}px`);
    await noHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
}

test("教师课表/班级/学生可操作且桌面无横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(staffUrl);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.getByRole("button", { name: "教学", exact: true }).click();
  await page.getByRole("button", { name: "课程表", exact: true }).click();
  await page.getByRole("button", { name: "周一" }).click();
  await expect(page.getByText("程序设计基础")).toBeVisible();
  await page.getByRole("button", { name: "我的班级", exact: true }).click();
  await expect(page.getByText("2024级软件工程1班").first()).toBeVisible();
  await page.getByRole("button", { name: "查看学生名单" }).click();
  await expect(page.locator(".teacher-card")).toHaveCount(8);
  await noHorizontalOverflow(page);
});
