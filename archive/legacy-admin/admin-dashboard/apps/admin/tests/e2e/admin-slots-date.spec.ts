import { expect, test } from "@playwright/test";
import { gotoPage, login } from "./helpers";

for (const type of ["admission", "parking"]) {
  test(`切换次日自动加载对应配额，保存不影响今日（${type}）`, async ({ page }) => {
    await login(page);
    await gotoPage(page, "/booking/slots", "预约配额");
    await page.getByLabel("类型", { exact: true }).selectOption(type);
    if (type === "parking") await page.getByLabel("停车场", { exact: true }).selectOption("p1");
    await page.getByRole("button", { name: "查询", exact: true }).click();
    const morning = page.locator("tbody tr", { hasText: "08:00—09:00" }).first();
    await expect(morning.getByRole("button", { name: "调整配额" })).toBeDisabled();
    const todayQuota = await morning.locator("td").nth(1).innerText();

    // 只切换日期，不额外点击查询。
    await page.getByLabel("日期", { exact: true }).selectOption("2026-09-13");
    await expect(morning.getByRole("button", { name: "调整配额" })).toBeEnabled();
    await expect(morning).not.toContainText("时段已结束");
    await morning.getByRole("button", { name: "调整配额" }).click();
    const dialog = page.getByRole("dialog", { name: "调整配额", exact: true });
    await expect(dialog).toContainText("2026-09-13 08:00—09:00");
    await dialog.getByLabel("现场配额").fill("47");
    await dialog.getByRole("button", { name: "保存配额" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(morning.locator("td").nth(1)).toHaveText("47");

    await page.getByLabel("日期", { exact: true }).selectOption("2026-09-12");
    await expect(morning.getByRole("button", { name: "调整配额" })).toBeDisabled();
    await expect(morning.locator("td").nth(1)).toHaveText(todayQuota);
    await page.getByLabel("日期", { exact: true }).selectOption("2026-09-13");
    await expect(morning.locator("td").nth(1)).toHaveText("47");
  });
}
