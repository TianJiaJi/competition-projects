import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir(".local/experience", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const chatText = "浏览器验收聊天-" + Date.now();
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:6179");
  await page.locator("#username").fill("admin01");
  await page.locator("#password").fill("123456");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("工作台", { exact: true }).first()).toBeVisible();
  for (const route of [
    "/users/staff",
    "/knowledge",
    "/oa",
    "/chat",
    "/booking/slots",
    "/inspections",
  ]) {
    await page.goto("http://127.0.0.1:6179/#" + route);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toContainText("读取失败");
    await page.screenshot({
      path: ".local/experience/admin-" + route.replaceAll("/", "-") + ".png",
      fullPage: true,
    });
  }
  await page.goto("http://127.0.0.1:6179/#/users/staff");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({ path: ".local/experience/account-editor.png" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  const tableY = (await page.locator(".people-table").boundingBox()).y;
  await page.route("**/api/v1/admin/people", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.continue();
  });
  await page.evaluate(async () => {
    await fetch("/api/v1/admin/staff-trades", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Bearer " + sessionStorage.getItem("qinglan.platform.admin"),
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({ name: "慢网验收" + Date.now() }),
    });
  });
  await page.waitForTimeout(250);
  expect(
    Math.abs((await page.locator(".people-table").boundingBox()).y - tableY),
  ).toBeLessThan(1);
  await page.waitForTimeout(1400);
  expect(
    Math.abs((await page.locator(".people-table").boundingBox()).y - tableY),
  ).toBeLessThan(1);
  await page.unroute("**/api/v1/admin/people");
  await page.goto("http://127.0.0.1:6179/#/content/articles/new");
  await page.locator("#title").fill("浏览器发布验收" + Date.now());
  await page.locator("#summary").fill("检验发布后自动返回列表");
  await page
    .locator("#body")
    .fill("验收正文：请沿开放步道游览，留意现场工作人员指引。");
  await page.getByRole("button", { name: "发布", exact: true }).click();
  await page.waitForURL("**/#/content/articles");
  await page.goto("http://127.0.0.1:6179/#/inspections");
  await page.getByRole("button", { name: "新增计划", exact: true }).click();
  await page.locator("#facilityId").selectOption("aed-entry");
  await page.locator("#intervalDays").fill("7");
  await page.locator("#nextDueDate").fill("2026-09-14");
  await page.locator("#instructions").fill("浏览器验收：检查安全设施完整性");
  await page.getByRole("button", { name: "保存计划", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const gate = await browser.newPage({ viewport: { width: 390, height: 844 } });
  gate.on("pageerror", (e) => errors.push(e.message));
  await gate.goto("http://127.0.0.1:6177");
  await gate.getByLabel("员工账号").fill("staff01");
  await gate.getByLabel("密码", { exact: true }).fill("123456");
  await gate.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    gate.getByRole("button", { name: "现场报修 / 申请关闭" }),
  ).toBeVisible();
  await gate.getByRole("button", { name: "现场报修 / 申请关闭" }).click();
  await gate
    .getByRole("dialog")
    .locator("select")
    .first()
    .selectOption("creek");
  await gate.getByLabel("现场情况 / 原因").fill("浏览器验收：护栏损坏");
  await gate.getByRole("button", { name: "提交", exact: true }).click();
  await expect(
    gate.getByText("浏览器验收：护栏损坏", { exact: true }).first(),
  ).toBeVisible();
  await gate.screenshot({
    path: ".local/experience/gate-mobile.png",
    fullPage: true,
  });
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto("http://127.0.0.1:6176/#/pages/login/index");
  await mobile.locator("input").nth(0).fill("visitor01");
  await mobile.locator("input[type=password]").fill("123456");
  await mobile.getByText("登录", { exact: true }).click();
  await mobile.waitForURL("**/pages/me/index");
  await mobile.goto("http://127.0.0.1:6176/#/pages/chat/index");
  await expect(mobile.getByText("游客聊天室", { exact: true })).toBeVisible();
  await mobile.locator(".composer input").fill(chatText);
  await mobile.getByText("发送", { exact: true }).click();
  await expect(
    mobile.getByText(chatText, { exact: true }).first(),
  ).toBeVisible();
  const layout = await mobile.locator(".composer").boundingBox();
  if (!layout || layout.y + layout.height > 850)
    throw Error("聊天室输入区超出视口");
  await mobile.screenshot({
    path: ".local/experience/mobile-chat.png",
    fullPage: true,
  });
  await mobile.setViewportSize({ width: 390, height: 500 });
  const shortLayout = await mobile.locator(".composer").boundingBox();
  expect(shortLayout.y + shortLayout.height).toBeLessThanOrEqual(501);
  console.log(
    JSON.stringify({ passed: true, pageErrors: errors, composer: layout }),
  );
  if (errors.length) throw Error("浏览器运行时错误");
} catch (error) {
  console.error(await page.getByRole("dialog").allTextContents());
  throw error;
} finally {
  await browser.close();
}
