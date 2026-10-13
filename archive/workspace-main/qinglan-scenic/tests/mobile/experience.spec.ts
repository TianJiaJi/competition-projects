import { test, expect } from "@playwright/test";
test("预约刷新恢复，取消更新详情和首页", async ({ page }) => {
  await page.goto("/");
  await page.getByText("入园预约", { exact: true }).click();
  await page.locator("#contact input").fill("演示游客");
  await page.locator("#phone input").fill("13800000000");
  await page.locator("#people input").fill("2");
  await page.getByText("确认预约", { exact: true }).click();
  await expect(page.getByText("预约成功", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("预约成功", { exact: true })).toBeVisible();
  await page.getByText("取消预约", { exact: true }).click();
  await page.getByText("确认取消", { exact: true }).click();
  await expect(page.getByText("预约已取消", { exact: true })).toBeVisible();
  await page.getByText("返回首页", { exact: true }).click();
  await expect(page.getByText("入园预约", { exact: true })).toBeVisible();
});
test("聊天室发送后刷新保留，其他房间不串消息", async ({ page }) => {
  await page.goto("/#/pages/chat/index");
  await page.locator("input").fill("只发到全园的测试消息");
  await page.getByText("发送", { exact: true }).click();
  await expect(
    page.getByText("只发到全园的测试消息", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("只发到全园的测试消息", { exact: true }),
  ).toBeVisible();
  await page.goto("/#/pages/chat/index?room=lake");
  await page.reload();
  await expect(
    page.getByText("只发到全园的测试消息", { exact: true }),
  ).toHaveCount(0);
});
test("默认路线可推荐、选用后地图能开始与暂停", async ({ page }) => {
  await page.goto("/#/pages/routes/index");
  await page.getByText("推荐路线", { exact: true }).click();
  await expect(page.getByText("入口人文短游", { exact: true })).toBeVisible();
  await page.getByText("选用路线", { exact: true }).first().click();
  await expect(
    page.getByText("未入园 · 路线预览", { exact: false }),
  ).toBeVisible();
  await page.getByText("开始 / 继续", { exact: true }).click();
  await expect(page.getByText("暂停", { exact: true })).toBeVisible();
  await page.getByText("暂停", { exact: true }).click();
  await expect(page.getByText("开始 / 继续", { exact: true })).toBeVisible();
});
test("关闭景点在详情与收藏中保持同一状态", async ({ page }) => {
  await page.goto("/#/pages/detail/index?id=lake");
  await expect(page.getByText("暂时关闭", { exact: true })).toBeVisible();
  await page.getByText("收藏", { exact: true }).click();
  await page.goto("/#/pages/content/index?mode=favourites");
  await expect(page.getByText("镜湖栈道", { exact: true })).toBeVisible();
  await expect(page.getByText("关闭", { exact: true })).toBeVisible();
});
test("320/360/430 宽度关键页没有横向溢出或运行异常", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of [
      "home",
      "guide",
      "booking",
      "me",
      "qa",
      "chat",
      "routes",
    ]) {
      await page.goto("/#/pages/" + path + "/index");
      await page.reload();
      await expect(page.locator("uni-page-body")).toBeVisible();
      await expect(page.locator(".heading,.title").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});
test("真实 DeepSeek 文字回答和引用可在页面完成", async ({ page }) => {
  test.skip(
    process.env.RUN_LIVE_QA !== "1",
    "真实模型测试显式启用，避免普通回归重复调用模型。",
  );
  test.setTimeout(100000);
  await page.goto("/#/pages/qa/index?poiId=lake");
  await page
    .locator("textarea")
    .fill("用两句话介绍镜湖栈道，并说明当前演示开放状态。");
  await page.getByText("发送", { exact: true }).click();
  await expect(page.getByText(/参考来源/).first()).toBeVisible({
    timeout: 90000,
  });
  await expect(page.getByText("发送", { exact: true })).toBeVisible();
  await page
    .getByText(/参考来源/)
    .first()
    .click();
  await expect(
    page.locator(".source").filter({ hasText: "镜湖栈道" }).first(),
  ).toBeVisible();
});
