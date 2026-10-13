import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const key = "qinglan.gate.mock.v1";
async function login(page: Page, user = "chen_demo") {
  await page.goto("/#/tasks");
  await page.getByLabel("员工账号").fill(user);
  await page.getByLabel("密码", { exact: true }).fill("GateDemo123!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "待办", exact: true }),
  ).toBeVisible();
}
async function openLake(page: Page) {
  await page.getByRole("button", { name: /紧急 · 客流/ }).click();
  await expect(
    page.getByRole("heading", { name: "镜湖栈道客流拥堵" }),
  ).toBeVisible();
}
async function createOA(page: Page) {
  await page.getByRole("button", { name: "提 OA", exact: true }).click();
  await page.getByLabel("申请原因").fill("现场疏导人手不足");
  await page.getByLabel("具体需求").fill("请安排两名安保人员");
  await page.getByRole("button", { name: "提交申请", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "增援申请", exact: true }),
  ).toBeVisible();
}
async function decision(page: Page, value = "approved") {
  await page.goto("/#/demo");
  await page.getByLabel("待审批申请").selectOption({ index: 1 });
  await page.getByLabel("审批结果").selectOption(value);
  await page
    .getByLabel("审批意见")
    .fill(
      value === "approved" ? "批准，已通知值班安保" : "请补充需求后重新申请",
    );
  await page.getByRole("button", { name: "保存审批结果" }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
}
test("领取、多个 OA、审批/撤回、归档与刷新", async ({ page }) => {
  await login(page);
  await openLake(page);
  await page.getByRole("button", { name: "开始处理", exact: true }).click();
  await createOA(page);
  await page.getByRole("button", { name: "返回任务", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "完成反馈", exact: true }),
  ).toBeDisabled();
  await createOA(page);
  await page.getByRole("button", { name: "撤回申请", exact: true }).click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.locator(".oa-heading")).toContainText("已撤回");
  await decision(page);
  await page.goto("/#/tasks/task-1");
  await page.getByRole("button", { name: "完成反馈", exact: true }).click();
  await page.getByLabel("处置结果").fill("已疏导游客，观景段通行恢复。");
  await page.getByRole("button", { name: "确认完成" }).click();
  await expect(page.getByRole("status")).toContainText("任务已归档");
  await page.reload();
  await expect(page.locator(".detail-page")).toContainText("已疏导游客");
  await page.getByRole("button", { name: "返回记录" }).click();
  await expect(
    page.getByRole("heading", { name: "记录", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".task-list")).toContainText("镜湖栈道客流拥堵");
});
test("驳回后重提，普通页面没有审批操作", async ({ page }) => {
  await login(page);
  await openLake(page);
  await page.getByRole("button", { name: "开始处理", exact: true }).click();
  await createOA(page);
  await expect(
    page.getByRole("button", { name: "批准", exact: true }),
  ).toHaveCount(0);
  await decision(page, "rejected");
  await page.goto("/#/tasks/task-1");
  await expect(page.locator(".oa-card")).toContainText("已驳回");
  await createOA(page);
  await page.getByRole("button", { name: "返回任务", exact: true }).click();
  await expect(page.locator(".oa-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "完成反馈", exact: true }),
  ).toBeDisabled();
});
test("换员工后只读，深链接表单也不能绕过权限", async ({ page }) => {
  await login(page);
  await openLake(page);
  await page.getByRole("button", { name: "开始处理", exact: true }).click();
  await page.getByRole("button", { name: "账号菜单" }).click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "li_demo");
  await openLake(page);
  await expect(
    page.getByRole("button", { name: "提 OA", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".detail-page")).toContainText(
    "此任务由 陈越 负责",
  );
  await page.goto("/#/tasks/task-1/apply");
  await expect(
    page.getByRole("heading", { name: "当前无法操作" }),
  ).toBeVisible();
});
test("必填反馈、存储失败保留输入、重试不重复提交", async ({ page }) => {
  await login(page);
  await openLake(page);
  await page.getByRole("button", { name: "开始处理", exact: true }).click();
  await page.getByRole("button", { name: "提 OA", exact: true }).click();
  await page.getByRole("button", { name: "提交申请", exact: true }).click();
  await expect(page.locator("#reason-error")).toHaveText("请填写 1—500 字。");
  await page.getByLabel("申请原因").fill("需要支援");
  await page.getByLabel("具体需求").fill("两名安保");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restore: () => void }).restore = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (k, v) {
      if (k === "qinglan.gate.mock.v1")
        throw new DOMException("quota", "QuotaExceededError");
      original.call(this, k, v);
    };
  });
  await page.getByRole("button", { name: "提交申请", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("本地保存失败");
  await expect(page.getByLabel("申请原因")).toHaveValue("需要支援");
  await page.evaluate(() =>
    (window as unknown as { restore: () => void }).restore(),
  );
  await page.getByRole("button", { name: "提交申请", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "增援申请", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) =>
        JSON.parse(localStorage.getItem(key)!).requests.filter(
          (o: { status: string }) => o.status === "pending",
        ).length,
      key,
    ),
  ).toBe(1);
});
test("跨标签冲突重新加载后保留草稿，禁止旧快照覆盖", async ({
  page,
  context,
}) => {
  await login(page);
  await openLake(page);
  await page.getByRole("button", { name: "开始处理", exact: true }).click();
  await page.getByRole("button", { name: "提 OA", exact: true }).click();
  await page.getByLabel("申请原因").fill("保留我的草稿");
  const other = await context.newPage();
  await login(other, "li_demo");
  await other.getByRole("button", { name: /竹影幽径保洁/ }).click();
  await other.getByRole("button", { name: "开始处理", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("其他页面变化");
  await expect(
    page.getByRole("button", { name: "提交申请", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByLabel("申请原因")).toHaveValue("保留我的草稿");
  await expect(
    page.getByRole("button", { name: "提交申请", exact: true }),
  ).toBeEnabled();
  await other.close();
  await page.getByLabel("具体需求").fill("两名安保");
  // A change without a storage event still fails CAS; reload must clear the old command version.
  await page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    data.tasks[0].version += 1;
    data.revision += 1;
    localStorage.setItem(key, JSON.stringify(data));
  }, key);
  await page.getByRole("button", { name: "提交申请", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("其他页面变化");
  await page.getByRole("button", { name: "重新加载" }).click();
  await page.getByRole("button", { name: "提交申请", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "增援申请", exact: true }),
  ).toBeVisible();
});
test("筛选空态、记录日期、我的 OA、账号重置与坏数据恢复", async ({ page }) => {
  await login(page);
  await page.getByLabel("搜索任务或位置").fill("不存在的任务");
  await expect(
    page.getByRole("heading", { name: "暂无符合条件的任务" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: "我的 OA", exact: false }).click();
  await page.getByLabel("申请状态").selectOption("approved");
  await expect(page.locator(".task-row")).toHaveCount(1);
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await page.getByRole("button", { name: "完成起始日期", exact: true }).click();
  await page.getByRole("dialog", { name: "完成起始日期" }).getByLabel("年份", { exact: true }).selectOption("2099");
  await page.getByRole("dialog", { name: "完成起始日期" }).getByLabel("月份", { exact: true }).selectOption("01");
  await page.getByRole("button", { name: "2099-01-01", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "暂无符合条件的任务" }),
  ).toBeVisible();
  await page.evaluate((key) => {
    localStorage.setItem("unrelated", "safe");
    localStorage.setItem(key, "{}");
  }, key);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("本地数据损坏");
  await page.getByRole("button", { name: "恢复本端样例", exact: true }).click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "待办", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("unrelated"))).toBe(
    "safe",
  );
  await expect(page.getByRole("button", { name: "账号菜单" })).toContainText(
    "陈越",
  );
});
test("草稿离开确认、未知路由与失效会话", async ({ page }) => {
  await login(page);
  await page.goto("/#/tasks/task-5/apply");
  await page.getByLabel("申请原因").fill("未提交内容");
  await page.getByRole("button", { name: "任务详情", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByLabel("申请原因")).toHaveValue("未提交内容");
  await page.getByRole("button", { name: "任务详情", exact: true }).click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "山顶索道排队疏导" }),
  ).toBeVisible();
  await page.goto("/#/unknown");
  await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();
  await page.evaluate(() =>
    sessionStorage.removeItem("qinglan.gate.session.v1"),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
});
test("确认稿关键页面视觉与窄屏验收", async ({ page }) => {
  await login(page);
  await expect(page.locator(".gate-background")).toBeVisible();
  await expect(page.locator(".gate-background")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  const folder = ".local/gate-qa";
  await mkdir(folder, { recursive: true });
  const noOverflow = async () =>
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await noOverflow();
    await page.screenshot({
      path: `${folder}/tasks-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await openLake(page);
  await page.screenshot({ path: `${folder}/detail-390.png`, fullPage: true });
  await page.getByRole("button", { name: "开始处理", exact: true }).click();
  await page.getByRole("button", { name: "提 OA", exact: true }).click();
  await page.screenshot({ path: `${folder}/oa-form-390.png`, fullPage: true });
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 500 });
    await page.getByLabel("具体需求").focus();
    await noOverflow();
    const submit = page.getByRole("button", { name: "提交申请", exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("申请原因").fill("现场人手不足");
  await page.getByLabel("具体需求").fill("请求两名安保人员支援");
  await page.getByRole("button", { name: "提交申请", exact: true }).click();
  await page.screenshot({
    path: `${folder}/oa-detail-390.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "撤回申请", exact: true }).click();
  await page.getByRole("button", { name: "确认", exact: true }).click();
  await page.getByRole("button", { name: "返回任务", exact: true }).click();
  await page.getByRole("button", { name: "完成反馈", exact: true }).click();
  await page.screenshot({ path: `${folder}/complete-390.png`, fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  await noOverflow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await noOverflow();
});
