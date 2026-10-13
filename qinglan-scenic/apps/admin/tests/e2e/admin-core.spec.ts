import { expect, test } from "@playwright/test";
import { DEMO, gotoPage, login } from "./helpers";

test.describe("登录、会话与工作台（ADM-01/ADM-02）", () => {
  test("错误登录提示、正确登录、深链回原页与退出", async ({ page }) => {
    await page.goto("/#/login");
    await expect(page.getByRole("heading", { name: "员工登录" })).toBeVisible();
    await page.locator("#username").fill(DEMO.username);
    await page.locator("#password").fill("wrong-password");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("alert").first()).toContainText("账号或密码不正确");

    await page.locator("#username").fill("");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("alert").first()).toContainText("账号不能为空");

    // 未登录访问业务页 → 回到登录并提示；登录后回到原页面
    await page.goto("/#/orders");
    await expect(page).toHaveURL(/#\/login\?redirect=/);
    await page.locator("#username").fill(DEMO.username);
    await page.locator("#password").fill(DEMO.password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("heading", { name: "订单管理" })).toBeVisible();

    // 刷新保留会话
    await page.reload();
    await expect(page.getByRole("heading", { name: "订单管理" })).toBeVisible();

    // 退出后业务服务不可用
    await page.getByRole("button", { name: "退出" }).click();
    await page.getByRole("button", { name: "退出", exact: true }).last().click();
    await expect(page.getByRole("heading", { name: "员工登录" })).toBeVisible();
    await page.goto("/#/overview");
    await expect(page.getByRole("heading", { name: "员工登录" })).toBeVisible();
  });

  test("工作台指标与跳转带上筛选，未知路由回工作台", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("button", { name: /当日有效入园预约人数/ })).toContainText("406");
    await expect(page.getByRole("button", { name: /当日有效停车预约辆数/ })).toContainText("54");
    await expect(page.getByRole("button", { name: /待处理举报/ })).toContainText("1");
    await expect(page.getByRole("button", { name: /未完成告警/ })).toContainText("8");

    await page.getByRole("button", { name: /当日有效停车预约辆数/ }).click();
    await expect(page.getByRole("heading", { name: "订单管理" })).toBeVisible();
    await page.getByRole("button", { name: /^筛选/ }).click();
    await expect(page.getByRole("dialog", { name: "筛选条件" }).getByLabel("来源")).toHaveValue("all");
    await page.getByRole("dialog", { name: "筛选条件" }).getByRole("button", { name: "关闭" }).click();

    await page.goto("/#/not-a-real-page");
    await expect(page.getByRole("heading", { name: "未知页面" })).toBeVisible();
    await page.getByRole("button", { name: "返回工作台" }).click();
    await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  });
});

test.describe("内容、公告与账号（ADM-03~ADM-06、ADM-12、ADM-14、ADM-15）", () => {
  test("景区资料查看—编辑—保存—刷新可复查", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/content/scenic", "景区资料");
    await page.getByRole("button", { name: "编辑资料" }).click();
    await page.getByLabel("景区名称").fill("青岚山境（E2E 改名）");
    await expect(page.getByRole("button", { name: /预览/ })).toHaveCount(0);
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.locator(".toast-host")).toContainText("已保存");
    await page.reload();
    await expect(page.locator("#scenic-name")).toHaveText("青岚山境（E2E 改名）");
    await expect(page.locator("#name")).toHaveCount(0);
  });

  test("资讯分页、筛选与发布下架", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/content/articles", "资讯与指南");
    await expect(page.getByText("共 22 条，第 1 / 2 页")).toBeVisible();
    await page.getByRole("button", { name: "下一页" }).click();
    await expect(page.getByText("共 22 条，第 2 / 2 页")).toBeVisible();

    await page.getByLabel("栏目").selectOption("news");
    await page.getByRole("button", { name: "查询" }).click();
    await expect(page.locator(".flow-load-note[role=status]")).toHaveCount(0);
    await expect(page.getByText("第 1 / 1 页")).toBeVisible();

    // 返回列表时保留本次页面筛选（§2.3）
    await page.locator("table.data-table tbody tr").first().getByRole("link", { name: "编辑" }).click();
    await expect(page.getByRole("heading", { name: /编辑内容/ })).toBeVisible();
    await page.getByRole("link", { name: "返回列表" }).click();
    await expect(page.getByRole("heading", { name: "资讯与指南" })).toBeVisible();
    await expect(page.getByLabel("栏目")).toHaveValue("news");

    const firstRow = page.locator("table.data-table tbody tr").first();
    const title = await firstRow.locator("td").first().innerText();
    await firstRow.getByRole("button", { name: "下架" }).click();
    await page.getByRole("button", { name: "下架", exact: true }).last().click();
    await expect(page.locator(".toast-host")).toContainText("已下架");
    expect(title.length).toBeGreaterThan(0);
  });

  test("新增内容：Markdown 工具栏、危险链接拒绝与草稿保护", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/content/articles/new", "新增内容");
    await page.getByLabel("标题").fill("E2E 新增内容");
    await page.getByLabel("摘要").fill("用于验证新增与发布流程的摘要。");
    await page.getByLabel("正文（Markdown）").fill("## E2E 标题\n\n- 列表项\n\n[危险](javascript:alert(1))");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText(/不允许的链接/)).toBeVisible();

    await page.getByLabel("正文（Markdown）").fill("## E2E 标题\n\n- 列表项\n\n![示意图](/assets/scenic-landscape.svg)");
    await page.getByRole("tab", { name: "完整预览", exact: true }).click();
    await expect(page.locator(".markdown-preview img").first()).toBeVisible();
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page).toHaveURL(/#\/content\/articles\/article-023\/edit/);
    await expect(page.locator(".toast-host")).toContainText("草稿已保存");

    // 未保存保护：修改后离开需要确认
    await page.getByLabel("标题").fill("E2E 新增内容（已修改）");
    await expect(page.locator("#title")).toHaveValue("E2E 新增内容（已修改）");
    await page.getByRole("link", { name: "返回列表" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("有未保存的修改");
    await page.getByRole("button", { name: "放弃修改并离开" }).click();
    await expect(page.getByRole("heading", { name: "资讯与指南" })).toBeVisible();
  });

  test("公告时效状态、景点覆盖名与用户禁用", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/notices", "公告管理");
    await page.getByLabel("生效状态").selectOption("pending");
    await page.getByRole("button", { name: "查询" }).click();
    await expect(page.locator(".flow-load-note[role=status]")).toHaveCount(0);
    await expect(page.getByText("峡谷段短时限流预告")).toBeVisible();
    await expect(page.locator("table.data-table tbody tr").first()).toContainText("待生效");

    await gotoPage(page, "/content/pois", "景点介绍");
    await page.locator("table.data-table tbody tr", { hasText: "听溪台" }).getByRole("link", { name: "编辑" }).click();
    await page.getByLabel("景点名称").fill("听溪台（E2E 覆盖名）");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.locator(".toast-host")).toContainText("已保存");
    await gotoPage(page, "/facilities", "设施运行");
    await page.getByLabel("关键词").fill("E2E 覆盖名");
    await page.getByRole("button", { name: "查询" }).click();
    await expect(page.locator(".flow-load-note[role=status]")).toHaveCount(0);
    await expect(page.locator("table.data-table tbody tr").first()).toContainText("听溪台（E2E 覆盖名）");

    await gotoPage(page, "/users", "游客管理");
    const visitorRow = page.locator("table.data-table tbody tr", { hasText: "山客小岚" }).first();
    await visitorRow.getByRole("button", { name: "禁用" }).click();
    await page.getByRole("button", { name: "禁用账号" }).click();
    await expect(page.locator(".toast-host")).toContainText("已禁用");
    await gotoPage(page, "/users/staff", "员工管理");
    const staffRow = page.locator("table.data-table tbody tr", { hasText: "值班主管" }).first();
    await expect(staffRow).toBeVisible();
    await expect(staffRow.getByRole("button", { name: "禁用", exact: true })).toHaveCount(0);
  });

  test("知识只读与来源缺失、服务状态样例", async ({ page }) => {
    await login(page);
    await gotoPage(page, "/knowledge", "知识查看");
    await page.getByLabel("关键词").fill("来源缺失");
    await page.getByRole("button", { name: "查询" }).click();
    await expect(page.locator(".flow-load-note[role=status]")).toHaveCount(0);
    await page.getByRole("button", { name: "查看详情" }).first().click();
    await expect(page.getByText(/来源缺失（source-archived）/)).toBeVisible();
    await expect(page.getByRole("button", { name: "保存" })).toHaveCount(0);
    await page.locator(".drawer").getByRole("button", { name: "关闭" }).first().click();

    await gotoPage(page, "/service-status", "服务状态");
    await expect(page.locator('[data-module="backend"]')).toContainText("未知");
    await expect(page.locator(".health-card__ring")).toHaveCount(7);
    await expect(page.getByText("数据检测时间", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "刷新" }).click();
    await expect(page.getByText("读取时间")).toBeVisible();
  });
});


test("唱片菜单遵循草稿守卫，编辑页归属与历史导航同步", async ({ page }) => {
  await login(page);
  await gotoPage(page, "/content/articles/new", "新增内容");
  await expect(page.locator(".rr-current")).toHaveAttribute("data-group", "scenic");
  await expect(page.locator(".rr-track[aria-current='page']")).toHaveText("资讯与指南");
  await page.locator("#title").fill("保留在编辑页的草稿");
  const overview = page.getByRole("button", { name: "概览", exact: true });
  await overview.focus();
  await overview.press("Enter");
  await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新增内容" })).toBeVisible();
  await expect(page.locator("#title")).toHaveValue("保留在编辑页的草稿");
  await expect(page.locator(".rr-current")).toHaveAttribute("data-group", "scenic");
  await overview.focus();
  await overview.press("Enter");
  await page.getByRole("button", { name: "放弃修改并离开" }).click();
  await expect(page.getByRole("heading", { name: "工作台", exact: true })).toBeVisible();
  await expect(page.locator(".rr-current")).toHaveAttribute("data-group", "overview");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "新增内容" })).toBeVisible();
  await expect(page.locator(".rr-current")).toHaveAttribute("data-group", "scenic");
});
