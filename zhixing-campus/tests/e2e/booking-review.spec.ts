import { expect, test } from "@playwright/test";
import { scenario } from "../../scenario/config";

const mobileUrl = `http://localhost:${process.env.E2E_MOBILE_PORT || scenario.ports.mobile}`;
const adminUrl = `http://localhost:${process.env.E2E_ADMIN_PORT || scenario.ports.admin}`;

test("学生预约后管理员审核，学生查看结果并取消", async ({ browser }) => {
  const student = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const admin = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const purpose = `跨端审核测试${Date.now()}`;
  const bookingDate = new Date(Date.now() + (1 + Math.floor(Math.random() * 45000)) * 86400000).toISOString().slice(0, 10);
  try {
    await student.goto(`${mobileUrl}/#/pages/booking/index`);
    await student.getByRole("button", { name: /提交预约申请/ }).click();
    await expect(student).toHaveURL(/pages\/login\/index/);
    await student.getByRole("button", { name: "登录", exact: true }).click();
    await expect(student).toHaveURL(/pages\/booking\/index/);
    await student.setViewportSize({ width: 1366, height: 768 });
    await student.locator('uni-picker input[type="date"]').fill(bookingDate);
    await student.setViewportSize({ width: 390, height: 844 });
    await student.getByRole("textbox", { name: "详细说明" }).fill(purpose);
    const responsePromise = student.waitForResponse((response) =>
      response.url().endsWith("/api/bookings") && response.request().method() === "POST",
    );
    await student.getByRole("button", { name: /提交预约申请/ }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const id = (await response.json()).data.id as string;
    const card = student.locator(".notice-card").filter({ hasText: purpose });
    await expect(card).toContainText("待审核");

    await admin.goto(adminUrl);
    await admin.getByRole("button", { name: "进入工作台" }).click();
    await admin.getByRole("button", { name: /教室预约待审核/ }).click();
    await admin.getByRole("button", { name: "刷新申请" }).click();
    await admin.getByRole("textbox", { name: "搜索教室预约" }).fill(id);
    await expect(admin.locator(".table-wrap tbody tr")).toHaveCount(1);
    await admin.locator(".table-wrap tbody tr .text-button").click();
    await expect(admin.getByRole("dialog")).toContainText(purpose);
    await admin.getByRole("button", { name: "通过预约" }).click();
    await expect(admin.getByRole("dialog")).toContainText("已预约");

    await student.getByRole("button", { name: "刷新预约状态" }).click();
    await expect(card).toContainText("已预约");
    await card.getByRole("button", { name: "取消预约" }).click();
    await expect(card).toContainText("已取消");
    await admin.getByRole("button", { name: "关闭详情" }).click();
    await admin.getByRole("button", { name: "刷新申请" }).click();
    await expect(admin.locator(".table-wrap tbody tr")).toContainText("已取消");

    const rejectedPurpose = `拒绝反馈测试${Date.now()}`;
    await student.goto(`${mobileUrl}/#/pages/booking/index`);
    await student.setViewportSize({ width: 1366, height: 768 });
    await student.locator('uni-picker input[type="date"]').fill(bookingDate);
    await student.setViewportSize({ width: 390, height: 844 });
    await student.getByRole("textbox", { name: "详细说明" }).fill(rejectedPurpose);
    const rejectionResponse = student.waitForResponse((response) =>
      response.url().endsWith("/api/bookings") && response.request().method() === "POST",
    );
    await student.getByRole("button", { name: /提交预约申请/ }).click();
    const rejectedId = (await (await rejectionResponse).json()).data.id as string;
    await admin.getByRole("button", { name: "刷新申请" }).click();
    await admin.getByRole("textbox", { name: "搜索教室预约" }).fill(rejectedId);
    await admin.locator(".table-wrap tbody tr .text-button").click();
    await admin.getByRole("button", { name: "拒绝申请" }).click();
    await expect(admin.getByRole("dialog").getByRole("alert")).toContainText("请填写原因");
    await admin.getByRole("textbox", { name: "拒绝原因" }).fill("教室正在维护");
    await admin.getByRole("button", { name: "拒绝申请" }).click();
    await expect(admin.getByRole("dialog")).toContainText("已拒绝");
    await student.getByRole("button", { name: "刷新预约状态" }).click();
    await expect(student.locator(".notice-card").filter({ hasText: rejectedPurpose }))
      .toContainText("审核说明：教室正在维护");
  } finally {
    await student.close();
    await admin.close();
  }
});

test("预约服务不可用时保留表单并提示失败", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${mobileUrl}/#/pages/booking/index`);
  await page.getByRole("button", { name: /提交预约申请/ }).click();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("textbox", { name: "详细说明" }).fill("服务断开测试");
  await page.route("**/api/bookings", (route) => route.abort());
  await page.getByRole("button", { name: /提交预约申请/ }).click();
  await expect(page.getByRole("alert")).toContainText("预约审核服务暂不可连接");
  await expect(page).toHaveURL(/pages\/booking\/index/);
  await expect(page.getByRole("textbox", { name: "详细说明" })).toHaveValue("服务断开测试");
});
