import { test, expect } from "@playwright/test";
import { scenario } from "../../scenario/config";
const url = (terminal: keyof typeof scenario.ports) =>
  `http://localhost:${
    terminal === "mobile"
      ? process.env.E2E_MOBILE_PORT || scenario.ports.mobile
      : terminal === "staff"
        ? process.env.E2E_STAFF_PORT || scenario.ports.staff
        : terminal === "admin"
          ? process.env.E2E_ADMIN_PORT || scenario.ports.admin
        : scenario.ports[terminal]
  }`;
async function login(page: any, terminal: "admin" | "staff") {
  await page.goto(url(terminal));
  await page.getByRole("button", { name: "进入工作台" }).click();
}
async function mobileLogin(page: any) {
  await page.goto(url("mobile") + "/#/pages/login/index");
  await page.getByRole("button", { name: "登录", exact: true }).click();
}
for (const terminal of ["public", "ops", "admin", "staff", "mobile"] as const) {
  test(`${terminal} 首屏独立打开，不请求业务接口`, async ({ page }) => {
    const errors: string[] = [],
      requests: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (/^\/(api|ws)(\/|$)/.test(new URL(r.url()).pathname))
        requests.push(r.url());
    });
    await page.goto(url(terminal));
    await expect(
      page.getByText(scenario.name, { exact: true }).first(),
    ).toBeVisible();
    if (terminal === "public" || terminal === "ops") {
      await expect(page.locator(".scene-shell")).toHaveAttribute(
        "data-intro-state",
        "ready",
        { timeout: 45000 },
      );
      await expect(page.locator(".map-marker")).toHaveCount(0);
      await page.getByRole("button", { name: "暂停旋转" }).click();
      await expect(
        page.getByRole("button", { name: "继续旋转" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "放大沙盘" }).click();
      await page.getByRole("button", { name: "复位沙盘" }).click();
    }
    expect(errors).toEqual([]);
    expect(requests).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("公共设施搜索、详情和返回焦点", async ({ page }) => {
  await page.goto(url("public") + "/#/facilities");
  const title = scenario.seed.facilities[0].title;
  await page
    .getByRole("textbox", { name: "搜索" + scenario.labels.facilities })
    .fill(title);
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await expect(page.getByRole("dialog")).toContainText(title);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "搜索" + scenario.labels.facilities })
    .fill("不存在");
  await expect(page.getByText("暂时没有匹配的记录")).toBeVisible();
});
test("后台校验、新增、编辑和刷新恢复", async ({ page }) => {
  await login(page, "admin");
  await page.goto(url("admin") + "/#/notices");
  await page.getByRole("button", { name: "新增", exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("请填写");
  await page.getByLabel("名称", { exact: true }).fill("新建测试公告");
  await page.getByLabel("位置", { exact: true }).fill("服务中心");
  await page
    .getByLabel("详细说明", { exact: true })
    .fill("这是一条本地演示公告");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("新建测试公告", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看新建测试公告" }).click();
  await page.getByRole("button", { name: "编辑记录" }).click();
  await page.getByLabel("名称", { exact: true }).fill("编辑后测试公告");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByText("编辑后测试公告", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page.getByText("编辑后测试公告", { exact: true })).toHaveCount(
    0,
  );
});
test("教师查看课程表与班级学生", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "staff");
  await expect(page.getByRole("heading", { name: "教学工作台" })).toBeVisible();
  await page.getByRole("button", { name: "教学", exact: true }).click();
  await page.getByRole("button", { name: "课程表", exact: true }).click();
  await page.getByRole("button", { name: "周一" }).click();
  await expect(page.getByText("程序设计基础")).toBeVisible();
  await page.getByRole("button", { name: "学生信息", exact: true }).click();
  await expect(page.locator(".teacher-card")).toHaveCount(8);
});
test("手机登录、报修、记录和刷新恢复", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileLogin(page);
  await page.goto(url("mobile") + "/#/pages/repair/index");
  await page.getByRole("button", { name: /提交申请/ }).click();
  await expect(page.getByText("请填写名称、位置和详细说明")).toBeVisible();
  await page
    .getByRole("textbox", { name: "名称", exact: true })
    .fill("手机报修测试");
  await page
    .getByRole("textbox", { name: "位置", exact: true })
    .fill("服务中心");
  await page
    .getByRole("textbox", { name: "详细说明", exact: true })
    .fill("请检查照明线路");
  await page.getByRole("button", { name: /提交申请/ }).click();
  await expect(page.getByText("手机报修测试", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("手机报修测试", { exact: true })).toHaveCount(0);
});
test("手机服务助手模拟问答", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileLogin(page);
  await page.goto(url("mobile") + "/#/pages/assistant/index");
  await page
    .getByRole("button", {
      name: new RegExp(scenario.questions[0].question.replace(/[？?]/g, ".")),
    })
    .click();
  await expect(
    page.getByText(scenario.questions[0].answer, { exact: true }),
  ).toBeVisible({ timeout: 15000 });
});
for (const size of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
]) {
  test(`桌面适配 ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await login(page, "admin");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByText("待办事项", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "切换深色" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
}
test("手机访客登记校验和记录", async ({ page }) => {
  test.skip(scenario.kind !== "community", "校园不提供访客登记");
  await page.setViewportSize({ width: 390, height: 844 });
  await mobileLogin(page);
  await page.goto(url("mobile") + "/#/pages/visitors/index");
  await page
    .getByRole("textbox", { name: "名称", exact: true })
    .fill("来访测试");
  await page
    .getByRole("textbox", { name: "位置", exact: true })
    .fill("1号楼102");
  await page
    .getByRole("textbox", { name: "详细说明", exact: true })
    .fill("下午探访亲友");
  await page
    .getByRole("textbox", { name: "联系电话", exact: true })
    .fill("123");
  await page.getByRole("button", { name: /提交申请/ }).click();
  await expect(page.getByText("请输入有效的 11 位手机号码")).toBeVisible();
  await page
    .getByRole("textbox", { name: "联系电话", exact: true })
    .fill("13800001000");
  await page.getByRole("button", { name: /提交申请/ }).click();
  await expect(page.getByText("来访测试", { exact: true })).toBeVisible();
});
test("唱片架可打开分组并进入页面", async ({ page }) => {
  await login(page, "admin");
  const group = scenario.navigation[1];
  await page
    .getByRole("button", { name: group.label, exact: true })
    .locator(".rr-label")
    .click();
  await expect(page).toHaveURL(new RegExp("#/" + group.items[0].id));
  await expect(
    page.getByRole("heading", { level: 1, name: group.items[0].label }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});
test("后台搜索状态、分页及设施数量校验", async ({ page }) => {
  await login(page, "admin");
  await page.goto(url("admin") + "/#/people");
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.getByText(/第|2 \/ 3 页/).last()).toBeVisible();
  await page.getByRole("combobox", { name: "状态筛选" }).selectOption("待认证");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.goto(url("admin") + "/#/facilities");
  await page
    .getByRole("button", { name: "查看" + scenario.seed.facilities[0].title })
    .click();
  await page.getByRole("button", { name: "编辑记录" }).click();
  await page.getByLabel("已使用", { exact: true }).fill("999");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("不能超过总量");
});
