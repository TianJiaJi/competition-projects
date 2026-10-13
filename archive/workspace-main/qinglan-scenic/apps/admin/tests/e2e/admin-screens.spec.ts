import { expect, test, type Page } from "@playwright/test";
import { closeDrawer, gotoPage, login } from "./helpers";

const OUT = "apps/admin/docs/screenshots";

/** 截图前等待提示消失与数据到位，避免截到加载态。 */
async function waitToasts(page: Page): Promise<void> {
  await page
    .waitForFunction(() => document.querySelectorAll(".toast-host .toast").length === 0, undefined, { timeout: 10_000 })
    .catch(() => undefined);
}

async function scrollDrawerToBottom(page: Page): Promise<void> {
  await page.locator(".drawer__body").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
}

async function waitRows(page: Page, min = 1): Promise<void> {
  await expect(page.locator("table.data-table tbody tr").first()).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => page.locator("table.data-table tbody tr").count(), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(min);
}

test.describe("验收截图（六类关键页面）", () => {
  test("1440×900 主验收尺寸下的关键页面", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await expect(page.getByRole("button", { name: /当日有效入园预约人数/ })).toContainText("406");
    await waitToasts(page);
    await page.screenshot({ path: `${OUT}/01-overview-1440.png`, fullPage: true });

    await gotoPage(page, "/content/articles/new", "新增内容");
    await page.getByLabel("标题").fill("秋日溪谷步行指引");
    await page.getByLabel("摘要").fill("沿听溪台支路缓行，注意雨后石阶湿滑。");
    await page
      .getByLabel("正文（Markdown）")
      .fill("## 秋日溪谷步行指引\n\n- 从入口广场沿主路向东\n- 溪谷段支路较窄，请靠右通行\n\n![听溪台示意](/assets/scenic-creek.svg)\n\n> 雨后请留意石阶。");
    await page.getByRole("tab", { name: "完整预览", exact: true }).click();
    await expect(page.locator(".markdown-preview img").first()).toBeVisible();
    await waitToasts(page);
    await page.screenshot({ path: `${OUT}/02-content-edit-1440.png`, fullPage: true });
    await page.getByRole("link", { name: "返回列表" }).click();
    await page.getByRole("button", { name: "放弃修改并离开" }).click();
    await expect(page.getByRole("heading", { name: "资讯与指南" })).toBeVisible();

    await gotoPage(page, "/orders", "订单管理");
    await waitRows(page);
    await page.locator("table.data-table tbody tr", { hasText: "ORD-20260912-0001" }).getByRole("button", { name: "详情" }).click();
    await page.getByRole("button", { name: "改期" }).click();
    await page.getByLabel("目标时段").selectOption("slot-admission-2026-09-12-16");
    await expect(page.getByText(/新时段：2026-09-12 16:00—17:00/)).toBeVisible();
    await scrollDrawerToBottom(page);
    await waitToasts(page);
    await page.screenshot({ path: `${OUT}/03-order-reschedule-1440.png`, fullPage: true });
    await closeDrawer(page);
    await page.getByRole("button", { name: "放弃修改", exact: true }).click();
    await expect(page.locator(".drawer")).toHaveCount(0);

    await gotoPage(page, "/facilities", "设施运行");
    await page.getByLabel("类别").selectOption("toilet");
    await page.getByRole("button", { name: "查询" }).click();
    await expect(page.locator(".flow-load-note[role=status]")).toHaveCount(0);
    await waitRows(page);
    await page.locator("table.data-table tbody tr", { hasText: "入口卫生间" }).getByRole("button", { name: "详情" }).click();
    await expect(page.getByText(/N = O \+ A \+ S/)).toBeVisible();
    await waitToasts(page);
    await page.screenshot({ path: `${OUT}/04-facility-restroom-1440.png`, fullPage: true });
    await closeDrawer(page);

    await gotoPage(page, "/inspections", "检修计划");
    await waitRows(page, 3);
    await waitToasts(page);
    await page.screenshot({ path: `${OUT}/05a-inspections-1440.png`, fullPage: true });

    await gotoPage(page, "/alerts", "告警记录");
    await waitRows(page, 5);
    await page.getByRole("button", { name: "只读详情" }).first().click();
    await expect(page.getByText("处理时间线")).toBeVisible();
    await scrollDrawerToBottom(page);
    await waitToasts(page);
    await page.screenshot({ path: `${OUT}/05b-alerts-detail-1440.png`, fullPage: true });
    await closeDrawer(page);

    await gotoPage(page, "/chat", "聊天管理");
    await expect(page.locator(".message-list .message").first()).toBeVisible();
    await waitToasts(page);
    await page.screenshot({ path: `${OUT}/06-chat-messages-1440.png`, fullPage: true });
  });

  test("1920×1080 与 1366×768 抽查", async ({ page }) => {
    for (const size of [
      { width: 1920, height: 1080, tag: "1920" },
      { width: 1366, height: 768, tag: "1366" },
    ]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await login(page);
      await expect(page.getByRole("button", { name: /当日有效入园预约人数/ })).toContainText("406");
      await waitToasts(page);
      await page.screenshot({ path: `${OUT}/07-overview-${size.tag}.png` });

      await gotoPage(page, "/content/articles", "资讯与指南");
      await waitRows(page, 20);
      await waitToasts(page);
      await page.screenshot({ path: `${OUT}/08-articles-${size.tag}.png` });

      await gotoPage(page, "/orders", "订单管理");
      await waitRows(page);
      await page.locator("table.data-table tbody tr", { hasText: "ORD-20260912-0001" }).getByRole("button", { name: "详情" }).click();
      await expect(page.getByText("入园订单详情")).toBeVisible();
      await waitToasts(page);
      await page.screenshot({ path: `${OUT}/09-order-detail-${size.tag}.png` });
      await closeDrawer(page);

      await gotoPage(page, "/content/scenic", "景区资料");
      await expect(page.locator("#scenic-name")).toHaveText("青岚山境");
      await waitToasts(page);
      await page.screenshot({ path: `${OUT}/11-scenic-form-${size.tag}.png` });

      await gotoPage(page, "/facilities", "设施运行");
      await waitRows(page, 10);
      await waitToasts(page);
      await page.screenshot({ path: `${OUT}/10-facilities-${size.tag}.png` });
    }
  });
});
