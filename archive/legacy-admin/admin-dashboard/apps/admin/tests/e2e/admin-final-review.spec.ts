import { expect, test } from "@playwright/test";
import { gotoPage, login } from "./helpers";

test("停留当前页时会话到期也返回登录，业务数据保留", async ({ page }) => {
  await page.clock.install();
  await login(page);
  const before = await page.evaluate(() => localStorage.getItem("qinglan.admin.mock.v1"));
  await page.clock.fastForward(12 * 60 * 60 * 1000 + 1);
  await expect(page.getByRole("heading", { name: "员工登录", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("qinglan.admin.mock.v1"))).toBe(before);
  expect(await page.evaluate(() => sessionStorage.getItem("qinglan.admin.mock.session.v1"))).toBeNull();
});

test("检修草稿关闭须确认，取消关闭保留输入，放弃后不残留守卫", async ({ page }) => {
  await login(page);
  await gotoPage(page, "/inspections", "检修计划");
  await page.getByRole("button", { name: "新增计划" }).click();
  await page.getByLabel("检修说明").fill("尚未保存的检修安排");
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).first().click();
  await expect(page.getByRole("alertdialog")).toContainText("未保存");
  await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByLabel("检修说明")).toHaveValue("尚未保存的检修安排");
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).first().click();
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();
  await page.getByRole("button", { name: "概览", exact: true }).focus();
    await page.getByRole("button", { name: "概览", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
});

for (const kind of ["设施", "配额", "订单", "举报"] as const) {
  test(`${kind}草稿取消关闭后保留，放弃后关闭`, async ({ page }) => {
    await login(page);
    if (kind === "设施") {
      await gotoPage(page, "/facilities", "设施运行");
      await page.getByRole("button", { name: "详情", exact: true }).first().click();
      await page.getByLabel("原因").fill("未保存的设施原因");
    } else if (kind === "配额") {
      await gotoPage(page, "/booking/slots", "预约配额");
      await page.locator("tr", { hasText: "15:00—16:00" }).getByRole("button", { name: "调整配额" }).click();
      await page.getByLabel("现场配额").fill("99");
    } else if (kind === "订单") {
      await gotoPage(page, "/orders", "订单管理");
      await page.locator("tr", { hasText: "ORD-20260912-0001" }).getByRole("button", { name: "详情" }).click();
      await page.getByRole("button", { name: "取消订单", exact: true }).click();
      await page.getByLabel("操作原因").fill("未保存的取消原因");
    } else {
      await gotoPage(page, "/chat?tab=reports", "聊天管理");
      await page.getByRole("button", { name: "查看详情" }).first().click();
      await page.getByLabel("处理说明").fill("未保存的举报处理");
    }
    const field = page.getByLabel(kind === "设施" ? "原因" : kind === "配额" ? "现场配额" : kind === "订单" ? "操作原因" : "处理说明");
    const draft = await field.inputValue();
    await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).first().click();
    await expect(page.getByRole("alertdialog")).toContainText("未保存");
    await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
    await expect(field).toHaveValue(draft);
    await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).first().click();
    await page.getByRole("button", { name: "放弃修改", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "概览", exact: true }).focus();
    await page.getByRole("button", { name: "概览", exact: true }).press("Enter");
    await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });
}

test("禁言抽屉关闭及外部切页受保护，放弃后无残留", async ({ page }) => {
  await login(page);
  await gotoPage(page, "/chat?tab=mutes", "聊天管理");
  await page.getByRole("button", { name: "设置禁言", exact: true }).click();
  await expect(page.getByLabel("游客")).not.toHaveValue("");
  await page.getByLabel("原因").fill("未提交的禁言原因");
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByLabel("原因")).toHaveValue("未提交的禁言原因");
  await page.evaluate(() => { location.hash = "#/chat?tab=reports"; });
  await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByLabel("原因")).toHaveValue("未提交的禁言原因");
  await page.evaluate(() => { location.hash = "#/chat?tab=reports"; });
  await page.getByRole("button", { name: "放弃修改并离开", exact: true }).click();
  await expect(page.getByRole("tab", { name: "举报", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "概览", exact: true }).focus();
  await page.getByRole("button", { name: "概览", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

for (const kind of ["文章", "景点"] as const) {
  test(`${kind}保存期间锁定字段，保存后继续编辑仍有草稿保护`, async ({ page }) => {
    await page.clock.install();
    await login(page);
    if (kind === "文章") {
      await gotoPage(page, "/content/articles", "资讯与指南");
      await page.getByRole("link", { name: "编辑", exact: true }).first().click();
    } else {
      await gotoPage(page, "/content/pois", "景点介绍");
      await page.getByRole("link", { name: "编辑", exact: true }).first().click();
    }
    const field = page.getByLabel(kind === "文章" ? "标题" : "景点名称");
    await expect(field).toBeVisible();
    await field.fill("本次提交的内容");
    await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000);
    await page.getByRole("button", { name: kind === "文章" ? "保存修改" : "保存", exact: true }).click();
    await expect(field).toBeDisabled();
    await page.clock.runFor(200);
    await expect(page.locator(".toast-host")).toContainText("已保存");
    await expect(field).toBeEnabled();
    await field.fill("保存后继续编辑的草稿");
    await page.getByRole("link", { name: "返回列表", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("未保存");
    await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
    await expect(field).toHaveValue("保存后继续编辑的草稿");
  });
}
