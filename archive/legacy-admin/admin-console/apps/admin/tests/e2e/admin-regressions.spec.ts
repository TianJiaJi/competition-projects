import { test, expect, type Page } from "@playwright/test";
import { login, gotoPage } from "./helpers";
import type { BusinessStore } from "../../src/core/types";

type TestWindow = Window & { __storageTest: { fail: boolean; writes: number } };
async function readBusiness(page: Page): Promise<BusinessStore> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("qinglan.admin.mock.v1")!));
}
async function installStorageFailure(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = { fail: true, writes: 0 };
    (window as unknown as TestWindow).__storageTest = state;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "qinglan.admin.mock.v1") {
        state.writes += 1;
        if (state.fail) throw new DOMException("测试写入失败", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
}
async function allowWrites(page: Page): Promise<void> {
  await page.evaluate(() => { (window as unknown as TestWindow).__storageTest.fail = false; });
}

test("另一标签保存后保留草稿并拒绝覆盖，重载后可以继续保存", async ({ page, context }) => {
  await login(page);
  await gotoPage(page, "/content/scenic", "景区资料");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("景区名称").fill("当前标签未保存的草稿");
  const other = await context.newPage();
  await login(other);
  await gotoPage(other, "/content/articles/article-001/edit", /编辑内容/);
  await other.locator("#title").fill("另一标签已保存的文章");
  await other.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(other.locator(".toast-host")).toContainText("修改已保存");
  await expect(page.locator("main > [role=status]")).toContainText("其他标签已更改后台数据");
  const latest = await readBusiness(other);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator('[role="alert"]')).toContainText("重新加载");
  await expect(page.getByLabel("景区名称")).toHaveValue("当前标签未保存的草稿");
  expect(await readBusiness(page)).toEqual(latest);
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByLabel("景区名称")).toHaveValue("青岚山境");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("景区名称").fill("重载后的新名称");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".toast-host")).toContainText("景区资料已保存");
  const saved = await readBusiness(page);
  expect(saved.global.articles.find((item) => item.id === "article-001")?.title).toBe("另一标签已保存的文章");
  expect(saved.global.scenic.name).toBe("重载后的新名称");
});

for (const kind of ["article", "notice"] as const) {
  test(`${kind} 新增发布写入失败保留输入，重试只保存一份已发布内容`, async ({ page }) => {
    await login(page);
    if (kind === "article") await gotoPage(page, "/content/articles/new", "新增内容");
    else {
      await gotoPage(page, "/notices", "公告管理");
      await page.getByRole("button", { name: "新增公告", exact: true }).click();
    }
    await page.locator("#title").fill("新增发布回归测试");
    if (kind === "article") await page.locator("#summary").fill("有效摘要");
    await page.locator("#body").fill("有效正文");
    const before = await readBusiness(page);
    await installStorageFailure(page);
    const publish = async () => {
      const editor = kind === "notice" ? page.getByRole("dialog", { name: "新增公告" }) : page;
      await editor.getByRole("button", { name: "发布", exact: true }).click();
      if (kind === "notice") await page.getByRole("alertdialog").getByRole("button", { name: "发布", exact: true }).click();
    };
    await publish();
    await expect(page.locator('[role="alert"]')).toContainText("本地保存失败");
    await expect(page.locator("#title")).toHaveValue("新增发布回归测试");
    expect(await readBusiness(page)).toEqual(before);
    expect(await page.locator(".toast-host").innerText()).not.toContain("已发布");
    await allowWrites(page);
    await publish();
    await expect(page.locator(".toast-host")).toContainText(kind === "article" ? "内容已创建并发布" : "公告已发布");
    const saved = await readBusiness(page);
    const previous = kind === "article" ? before.global.articles : before.runs[before.activeRunId].notices;
    const items = kind === "article" ? saved.global.articles : saved.runs[saved.activeRunId].notices;
    expect(items).toHaveLength(previous.length + 1);
    expect(items.find((item) => item.title === "新增发布回归测试")?.published).toBe(true);
    // 一次失败尝试 + 一次成功持久化，没有单独的第二次发布写入。
    expect(await page.evaluate(() => (window as unknown as TestWindow).__storageTest.writes)).toBe(2);
    await page.reload();
    expect(await readBusiness(page)).toEqual(saved);
  });
}

test("恢复样例写入失败不提示成功、不刷新，原数据保留且可以重试", async ({ page }) => {
  await login(page);
  await gotoPage(page, "/content/scenic", "景区资料");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("景区名称").fill("恢复前已保存的名称");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".toast-host")).toContainText("景区资料已保存");
  const previous = await readBusiness(page);
  await installStorageFailure(page);
  await page.getByText("更多", { exact: true }).click();
  const reset = async () => {
    await page.getByRole("button", { name: "恢复样例", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "恢复样例", exact: true }).click();
  };
  await reset();
  await expect(page.locator(".toast-host")).toContainText("本地保存失败");
  await expect(page.getByLabel("景区名称")).toHaveValue("恢复前已保存的名称");
  expect(await readBusiness(page)).toEqual(previous);
  await allowWrites(page);
  await reset();
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
  expect((await readBusiness(page)).global.scenic.name).toBe("青岚山境");
});

test("部分存储损坏仍可进入恢复入口", async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem("qinglan.admin.mock.v1")!);
    delete store.global.inspectionPlans;
    localStorage.setItem("qinglan.admin.mock.v1", JSON.stringify(store));
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
  await expect(page.locator("main > [role=status]")).toContainText("结构损坏");
  await page.getByText("更多", { exact: true }).click();
  await page.getByRole("button", { name: "恢复样例", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "恢复样例", exact: true }).click();
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
  await expect(page.locator("main > [role=status]")).toHaveCount(0);
  expect((await readBusiness(page)).global.inspectionPlans.length).toBeGreaterThan(0);
});

test("停车场筛选后切回入园仍显示全部档位", async ({ page }) => {
  await login(page);
  await gotoPage(page, "/booking/slots", "预约配额");
  await page.getByLabel("类型", { exact: true }).selectOption("parking");
  await page.getByLabel("停车场", { exact: true }).selectOption("p1");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.locator("table tbody tr")).toHaveCount(9);
  await page.getByLabel("类型", { exact: true }).selectOption("admission");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await expect(page.locator("table tbody tr")).toHaveCount(9);
  await expect(page.locator("table tbody tr").first()).toContainText("人");
});

test("放弃公告草稿离开后，后续导航不会被旧守卫拦截", async ({ page }) => {
  await login(page);
  await gotoPage(page, "/notices", "公告管理");
  await page.getByRole("button", { name: "新增公告", exact: true }).click();
  await page.locator("#title").fill("即将放弃的草稿");
  // 模拟用户在地址栏切换 hash，抽屉遮罩下不强行点击侧栏。
  await page.evaluate(() => { window.location.hash = "#/overview"; });
  await page.getByRole("button", { name: "放弃修改并离开" }).click();
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "订单管理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "订单管理", exact: true })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("工作台有效预约入口清理不相关的旧筛选，同路径查询变化也生效", async ({ page }) => {
  await login(page);
  await gotoPage(page, "/orders", "订单管理");
  await page.getByLabel("预约状态", { exact: true }).selectOption("cancelled");
  await page.getByLabel("履约状态", { exact: true }).selectOption("in_park");
  await page.getByLabel("关键词", { exact: true }).fill("不相关的关键词");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  await page.getByRole("link", { name: "工作台", exact: true }).click();
  await page.getByRole("button", { name: /当日有效入园预约人数/ }).click();
  await expect(page.getByLabel("预约状态", { exact: true })).toHaveValue("confirmed");
  await expect(page.getByLabel("履约状态", { exact: true })).toHaveValue("all");
  await expect(page.getByLabel("关键词", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("来源", { exact: true })).toHaveValue("all");
  await expect(page.locator("table tbody tr").first()).toContainText("有效");
  await page.evaluate(() => { window.location.hash = "#/orders?date=2026-09-12&type=parking&source=all&reservationStatus=confirmed"; });
  await expect(page.getByLabel("类型", { exact: true })).toHaveValue("parking");
  await expect(page.locator("table tbody tr").first()).toContainText("停车");
});
