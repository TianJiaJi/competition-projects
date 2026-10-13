import { expect, test } from "@playwright/test";
import { scenario } from "../../scenario/config";

const mobileUrl = `http://localhost:${process.env.E2E_MOBILE_PORT || scenario.ports.mobile}`;
const staffUrl = `http://localhost:${process.env.E2E_STAFF_PORT || scenario.ports.staff}`;

async function noHorizontalOverflow(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

for (const width of [360, 390, 430]) {
  test(`手机界面 ${width}px：详情与任务不裁切`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto(`${mobileUrl}/#/pages/services/index`);
    await page.locator(".service-card").first().click();
    const back = page.getByRole("button", { name: "返回" });
    await expect(back).toBeVisible();
    expect((await back.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await noHorizontalOverflow(page);
    if (width === 390)
      await page.screenshot({
        path: "test-results/campus-mobile-detail-390.png",
      });

    await page.goto(staffUrl);
    await page.getByRole("button", { name: "进入工作台" }).click();
    await expect(
      page.getByRole("navigation", { name: "页面导航" }),
    ).toBeVisible();
    await expect(page.locator(".record-card").first()).toBeVisible();
    await noHorizontalOverflow(page);
    if (width === 390)
      await page.screenshot({
        path: "test-results/campus-staff-tasks-390.png",
      });
    await page.locator(".record-card .card-hit").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator(".staff-detail .drawer")).toHaveCSS(
      "width",
      `${width}px`,
    );
    await noHorizontalOverflow(page);
    if (width === 390) {
      await expect
        .poll(() =>
          page
            .locator(".staff-detail")
            .evaluate((el) => getComputedStyle(el).opacity),
        )
        .toBe("1");
      await page.screenshot({
        path: "test-results/campus-staff-detail-390.png",
      });
    }
    expect(errors).toEqual([]);
  });
}

test("用户端：搜索、详情返回、预约取消与报修", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${mobileUrl}/#/pages/login/index`);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.goto(`${mobileUrl}/#/pages/services/index`);
  await page.getByRole("textbox", { name: "搜索设施" }).fill("图书馆");
  await expect(page.locator(".service-card")).toHaveCount(2);
  await page.locator(".service-card").first().click();
  await expect(page.locator(".detail-hero")).toContainText("图书馆研讨室");
  await page.getByRole("button", { name: "返回" }).click();
  await expect(page).toHaveURL(/pages\/services\/index/);
  await page.locator(".service-card").first().click();
  await page.getByRole("button", { name: /预约教室/ }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator('uni-picker input[type="date"]').fill(
    new Date(Date.now() + (1 + Math.floor(Math.random() * 45000)) * 86400000).toISOString().slice(0, 10),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".picker-field").first()).toContainText(
    "图书馆研讨室",
  );
  await page.getByRole("button", { name: /提交预约申请/ }).click();
  await expect(page.getByText("请填写 2–200 字的使用说明")).toBeVisible();
  const purpose = `课题讨论${Date.now()}`;
  await page.getByRole("textbox", { name: "详细说明" }).fill(purpose);
  await page.getByRole("button", { name: /提交预约申请/ }).click();
  const booking = page
    .locator(".notice-card")
    .filter({ hasText: purpose });
  await expect(booking).toBeVisible();
  await booking.getByRole("button", { name: "取消预约" }).click();
  await expect(booking).toContainText("已取消");

  await page.goto(`${mobileUrl}/#/pages/repair/index`);
  await page.getByRole("button", { name: /提交申请/ }).click();
  await expect(page.getByText("请填写名称、位置和详细说明")).toBeVisible();
  await page.getByRole("textbox", { name: "名称" }).fill("投影报修测试");
  await page.getByRole("textbox", { name: "位置" }).fill("明理楼 302");
  await page.getByRole("textbox", { name: "详细说明" }).fill("画面偏色");
  await page.getByRole("button", { name: /提交申请/ }).click();
  await expect(page.getByText("投影报修测试", { exact: true })).toBeVisible();
});

test("员工端：筛选、领取、校验处理结果与历史查询", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(staffUrl);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.getByRole("textbox", { name: "搜索今日任务" }).fill("投影");
  await page.getByRole("combobox", { name: "状态筛选" }).selectOption("待处理");
  await expect(page.locator(".record-card")).toHaveCount(1);
  await page.locator(".record-card .card-hit").click();
  await page.getByRole("button", { name: "领取任务" }).click();
  await expect(page.getByRole("dialog")).toContainText("处理中");
  await page.getByRole("button", { name: /提交处理结果/ }).click();
  await expect(page.getByRole("alert")).toContainText("请填写处理结果");
  await page
    .getByRole("textbox", { name: "处理结果" })
    .fill("已更换灯源，画面正常");
  await page.getByRole("button", { name: /提交处理结果/ }).click();
  await expect(page.getByRole("dialog")).toContainText("已完成");
  await page.getByRole("button", { name: "关闭详情" }).click();
  await page.getByRole("button", { name: "历史记录" }).click();
  await expect(
    page.locator(".record-card").filter({ hasText: "明理楼投影画面偏色" }),
  ).toBeVisible();
});

test("桌面宽度保留两端可用布局", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(staffUrl);
  await page.getByRole("button", { name: "进入工作台" }).click();
  await noHorizontalOverflow(page);
  await expect(
    page.getByRole("navigation", { name: "页面导航" }),
  ).toBeVisible();
  await page.goto(`${mobileUrl}/#/pages/services/index`);
  await noHorizontalOverflow(page);
  await expect(page.locator(".service-card").first()).toBeVisible();
});
