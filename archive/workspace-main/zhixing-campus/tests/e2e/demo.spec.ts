import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { definition } from "../../packages/demo/src/samples/school";
const api = "http://localhost:5507",
  workbench = "http://localhost:5506/";
async function newRun(request: APIRequestContext, stage = 0) {
  const existing = await (await request.get(api + "/api/workbench")).json();
  let state = await (
    await request.post(api + "/api/new", { data: { run: existing.state.run } })
  ).json();
  for (const id of ["01", "02", "03"].slice(0, stage))
    state = await assembleApi(request, state.run, id);
  return state;
}
async function waitNode(
  request: APIRequestContext,
  id: string,
  status: string,
) {
  await expect
    .poll(
      async () =>
        (await (await request.get(api + "/api/workbench")).json()).state.nodes[
          id
        ].status,
      { timeout: 60000 },
    )
    .toBe(status);
}
async function assembleApi(
  request: APIRequestContext,
  run: string,
  id: string,
) {
  const action = async (node: string, action: string, data = {}) => {
    const result = await request.post(`${api}/api/runs/${run}/node`, {
      data: { node, action, ...data },
    });
    expect(result.ok(), await result.text()).toBeTruthy();
    return result.json();
  };
  for (const n of definition.workflow.filter(
    (n) => n.stage === id && n.kind === "source",
  ))
    await action(n.id, "import", { file: { name: "any-input.bin" } });
  await action(id + "-requirement", "submit", { text: "浏览器测试需求 " + id });
  await waitNode(request, id + "-adjustment", "ready");
  await action(id + "-adjustment", "submit", { text: "浏览器测试调整 " + id });
  await action(id + "-adjustment", "confirm");
  await waitNode(request, id + "-acceptance", "waiting");
  return action(id + "-acceptance", "accept", {
    passed: true,
    detail: "自动化测试观察，不作为真人核验",
  });
}
function url(run: string, terminal: string, stage = "03") {
  const port = definition.previews.find((p) => p.id === terminal)!.port;
  return `http://localhost:${port}/?${new URLSearchParams({ demo: "1", caseId: definition.caseId, version: definition.version, run, stage, terminal })}`;
}
async function login(page: Page, terminal = "staff") {
  const button = page.getByRole("button", {
    name: terminal === "mobile" ? "登录" : "进入工作台",
    exact: terminal === "mobile",
  });
  await button.click();
  await expect(button).toHaveCount(0);
}
async function locate(page: Page, id: string) {
  await page.getByLabel("定位节点", { exact: true }).selectOption(id);
}
async function assemble(page: Page, id: string) {
  for (const n of definition.workflow.filter(
    (n) => n.stage === id && n.kind === "source",
  )) {
    await locate(page, n.id);
    await page
      .getByTestId("node-" + n.id)
      .getByRole("button", { name: "载入参考素材", exact: true })
      .click();
    await expect(page.getByTestId("node-" + n.id)).toHaveAttribute(
      "data-status",
      "complete",
    );
  }
  await locate(page, id + "-requirement");
  const requirement = page.getByTestId("node-" + id + "-requirement");
  await requirement
    .getByLabel("需求描述", { exact: true })
    .fill("操作员的需求原文 " + id);
  await requirement
    .getByRole("button", { name: "提交需求", exact: true })
    .click();
  const adjustment = page.getByTestId("node-" + id + "-adjustment");
  await expect(adjustment).toHaveAttribute("data-status", "ready", {
    timeout: 60000,
  });
  await locate(page, id + "-adjustment");
  await adjustment
    .getByLabel("修改说明", { exact: true })
    .fill("操作员的调整原文 " + id);
  await adjustment
    .getByRole("button", { name: "提交调整", exact: true })
    .click();
  await adjustment
    .getByRole("button", { name: "确认组装", exact: true })
    .click();
  const acceptance = page.getByTestId("node-" + id + "-acceptance");
  await expect(acceptance).toHaveAttribute("data-status", "waiting", {
    timeout: 60000,
  });
  await locate(page, id + "-acceptance");
}
async function accept(page: Page, id: string) {
  const node = page.getByTestId("node-" + id + "-acceptance");
  await node
    .getByLabel("验收观察")
    .fill("自动化观察 " + id + "，等待实际现场核验");
  await node.getByRole("button", { name: "验收通过", exact: true }).click();
  await expect(node).toHaveAttribute("data-status", "complete");
}
test("连续节点、自动推进、验收交接、分段预览和报告", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const state = await newRun(request);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(workbench);
  await expect(page).toHaveTitle("应用搭建工作台");
  await expect(page.locator(".drawer")).toHaveCount(0);
  await expect(page.getByTestId("node-02-requirement")).toHaveAttribute(
    "data-status",
    "blocked",
  );
  expect(await page.locator("body").innerText()).not.toMatch(
    /预制|模拟|真实执行|非真实 AI/,
  );
  await assemble(page, "01");
  await expect(
    page
      .getByTestId("node-01-acceptance")
      .getByRole("button", { name: "验收通过", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("node-02-requirement")).toHaveAttribute(
    "data-status",
    "blocked",
  );
  const popup = page.waitForEvent("popup");
  await page.getByTestId("node-01-acceptance").getByRole("link").click();
  const map = await popup;
  await expect(map.locator(".scene-shell")).toHaveAttribute(
    "data-intro-state",
    "ready",
    { timeout: 45000 },
  );
  await expect(map.locator(".space-only")).toBeVisible();
  await map.getByRole("button", { name: "聚焦教学区 · 设施详情" }).click();
  await expect(map.getByText("F4", { exact: false }).first()).toBeVisible();
  await map.close();
  await accept(page, "01");
  await assemble(page, "02");
  await expect(
    page.getByTestId("node-02-acceptance").locator(".preview-item"),
  ).toHaveCount(5);
  await accept(page, "02");
  await assemble(page, "03");
  await page.screenshot({
    path: "test-results/canvas-acceptance.png",
    fullPage: true,
  });
  await accept(page, "03");
  await page.reload();
  await expect(
    page.getByTestId("node-03-requirement").getByLabel("需求描述"),
  ).toHaveValue("操作员的需求原文 03");
  const before = await (
    await request.get(`${api}/api/runs/${state.run}/records`)
  ).json();
  await page.getByRole("button", { name: "本轮报告", exact: true }).click();
  await page.getByRole("button", { name: "在独立副本执行检查" }).click();
  await expect(page.getByText("全部通过", { exact: true })).toBeVisible();
  await expect(page.locator(".summary")).toContainText("0 / 5 已登记");
  const after = await (
    await request.get(`${api}/api/runs/${state.run}/records`)
  ).json();
  expect(after.records).toEqual(before.records);
  await page
    .getByLabel("H01 · 大屏文字、沙盘与空间详情可读", { exact: true })
    .fill("自动化登记，待真人观察");
  await page.getByLabel("H01 核验结果").selectOption("false");
  await page
    .locator(".observations form")
    .first()
    .getByRole("button", { name: "登记观察" })
    .click();
  await expect(page.locator(".observations form").first()).toContainText(
    "失败 · 自动化登记",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出本轮记录" }).click();
  expect((await download).suggestedFilename()).toContain(state.run);
  expect(errors).toEqual([]);
});
test("五端真实读写：手机报修→后勤处理→手机结果，登录恢复、普通查看不重置", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(150000);
  const state = await newRun(request, 3);
  const mobile = await context.newPage();
  await mobile.goto(url(state.run, "mobile") + "#/pages/login/index");
  await login(mobile, "mobile");
  await mobile.goto(url(state.run, "mobile") + "#/pages/repair/index");
  await mobile
    .getByRole("textbox", { name: "名称", exact: true })
    .fill("跨端报修验证");
  await mobile
    .getByRole("textbox", { name: "位置", exact: true })
    .fill("图书馆研讨室");
  await mobile
    .getByRole("textbox", { name: "详细说明", exact: true })
    .fill("请检查投影信号");
  await mobile.getByRole("button", { name: /提交申请/ }).click();
  await expect(mobile.getByText("跨端报修验证", { exact: true })).toBeVisible();
  await page.goto(workbench);
  await page.getByRole("button", { name: "最新成果", exact: true }).click();
  const popup = page.waitForEvent("popup");
  await page
    .locator(".utility-panel .preview-item")
    .filter({ hasText: "后勤端" })
    .getByRole("link")
    .click();
  const staff = await popup;
  await login(staff);
  await expect(
    staff.getByRole("heading", { name: "早安，后勤人员。" }),
  ).toBeVisible();
  await staff.getByRole("button", { name: /跨端报修验证/ }).click();
  await staff.getByRole("button", { name: "领取任务", exact: true }).click();
  await staff.getByRole("button", { name: "提交处理结果" }).click();
  await expect(staff.getByRole("alert")).toContainText("请填写处理结果");
  await staff
    .getByLabel("处理结果", { exact: true })
    .fill("检查信号线，图像恢复正常");
  await staff.getByRole("button", { name: "提交处理结果" }).click();
  await expect(staff.getByRole("dialog")).toContainText(
    "检查信号线，图像恢复正常",
  );
  await expect(
    mobile.getByText("处理结果：检查信号线，图像恢复正常"),
  ).toBeVisible({ timeout: 8000 });
  await page
    .locator(".utility-panel .preview-item")
    .filter({ hasText: "后勤端" })
    .getByRole("link")
    .click();
  await expect(staff.getByRole("dialog")).toContainText(
    "检查信号线，图像恢复正常",
  );
  await page.reload();
  await page.getByRole("button", { name: "最新成果", exact: true }).click();
  await page
    .locator(".utility-panel .preview-item")
    .filter({ hasText: "后勤端" })
    .getByRole("link")
    .click();
  await expect(staff.getByRole("dialog")).toContainText(
    "检查信号线，图像恢复正常",
  );
  await staff.reload();
  await expect(staff.getByRole("button", { name: "进入工作台" })).toHaveCount(
    0,
  );
  await mobile.reload();
  await expect(mobile.getByText("跨端报修验证", { exact: true })).toBeVisible();
  await staff.close();
  const reopened = page.waitForEvent("popup");
  await page
    .locator(".utility-panel .preview-item")
    .filter({ hasText: "后勤端" })
    .getByRole("link")
    .click();
  const staff2 = await reopened;
  await login(staff2);
  await staff2.goto(url(state.run, "staff") + "#/history");
  await expect(staff2.getByText("跨端报修验证", { exact: true })).toBeVisible();
  expect(
    (
      await (await request.get(`${api}/api/runs/${state.run}/records`)).json()
    ).records.tasks.find((r: any) => r.title === "跨端报修验证"),
  ).toMatchObject({
    submitterId: "user01",
    assigneeId: "staff01",
    status: "已完成",
  });
});
test("预约/取消、后台维护跨端刷新、巡检闭环", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(120000);
  const state = await newRun(request, 3);
  await page.goto(url(state.run, "mobile") + "#/pages/login/index");
  await login(page, "mobile");
  await page.goto(url(state.run, "mobile") + "#/pages/booking/index");
  await page
    .getByRole("textbox", { name: "详细说明", exact: true })
    .fill("跨端预约");
  await page.getByRole("button", { name: /确认预约/ }).click();
  await expect(page.getByText(/跨端预约/)).toBeVisible();
  await page
    .locator(".notice-card")
    .filter({ hasText: "跨端预约" })
    .getByRole("button", { name: "取消预约" })
    .click();
  await expect(
    page.locator(".notice-card").filter({ hasText: "跨端预约" }),
  ).toContainText("已取消");
  const admin = await context.newPage();
  await admin.goto(url(state.run, "admin") + "#/notices");
  await login(admin, "admin");
  await admin.getByRole("button", { name: "新增", exact: true }).click();
  await admin.getByLabel("名称", { exact: true }).fill("联通公告");
  await admin.getByLabel("位置", { exact: true }).fill("服务中心");
  await admin.getByLabel("详细说明", { exact: true }).fill("数据库中的公告");
  await admin.getByRole("button", { name: "保存", exact: true }).click();
  await expect(admin.getByText("联通公告", { exact: true })).toBeVisible();
  await page.goto(url(state.run, "mobile") + "#/pages/notices/index");
  await expect(page.getByText("联通公告", { exact: true })).toBeVisible({
    timeout: 8000,
  });
  const staff = await context.newPage();
  await staff.goto(url(state.run, "staff") + "#/inspections");
  await login(staff);
  await staff.getByRole("button", { name: /实验室安全巡检/ }).click();
  await staff.getByRole("button", { name: "领取任务", exact: true }).click();
  await staff.getByLabel("处理结果").fill("通道畅通，检查完成");
  await staff.getByRole("button", { name: "提交处理结果" }).click();
  await expect(staff.getByRole("dialog")).toContainText("通道畅通，检查完成");
});
test("02 本端独立样例与刷新恢复；阶段预览独立且保留身份", async ({
  page,
  context,
  request,
}) => {
  const state = await newRun(request, 2);
  await page.goto(url(state.run, "staff", "02"));
  await login(page);
  await page.getByRole("button", { name: /明理楼投影画面偏色/ }).click();
  await page.getByRole("button", { name: "领取任务", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "进入工作台" })).toHaveCount(0);
  await page.getByRole("button", { name: /明理楼投影画面偏色/ }).click();
  await expect(
    page.getByRole("button", { name: "领取任务", exact: true }),
  ).toBeVisible();
  const other = await context.newPage();
  await other.goto(url(state.run, "staff", "02"));
  await login(other);
  await other.getByRole("button", { name: /明理楼投影画面偏色/ }).click();
  await expect(
    other.getByRole("button", { name: "领取任务", exact: true }),
  ).toBeVisible();
  await assembleApi(request, state.run, "03");
  await page.reload();
  await expect(page).toHaveURL(/stage=02/);
  await expect(page.getByRole("button", { name: "进入工作台" })).toHaveCount(0);
  const integrated = await context.newPage();
  await integrated.goto(url(state.run, "staff", "03"));
  await login(integrated);
  await expect(integrated).toHaveURL(/stage=03/);
});
test("旧轮失效、非法阶段、服务失败不回落样例", async ({ page, request }) => {
  const state = await newRun(request, 3);
  await page.goto(url(state.run, "staff").replace("stage=03", "stage=invalid"));
  await expect(page.getByRole("alert")).toContainText("成果参数无效");
  await page.goto(url(state.run, "staff"));
  await login(page);
  await page.route("**:5507/**", (route) => route.abort());
  await expect(page.getByRole("alert")).toContainText("不可用", {
    timeout: 12000,
  });
  await page.unroute("**:5507/**");
  await newRun(request);
  await expect(page.getByRole("alert")).toContainText("本轮成果已失效", {
    timeout: 10000,
  });
});
test("窗口就绪需登录；伪造消息被拒绝，超时可重试", async ({
  page,
  request,
}) => {
  const state = await newRun(request, 3);
  await page.goto(workbench);
  await page.getByRole("button", { name: "最新成果", exact: true }).click();
  const popup = page.waitForEvent("popup");
  await page
    .locator(".utility-panel .preview-item")
    .filter({ hasText: "后勤端" })
    .getByRole("link")
    .click();
  const staff = await popup;
  await expect(staff.getByRole("button", { name: "进入工作台" })).toBeVisible();
  await page.evaluate(
    ({ run, caseId, version }) =>
      window.postMessage(
        {
          protocol: "assembly-v2",
          run,
          caseId,
          version,
          stage: "03",
          terminal: "staff",
          type: "ready",
        },
        location.origin,
      ),
    { run: state.run, caseId: definition.caseId, version: definition.version },
  );
  await expect(
    page.locator(".utility-panel .preview-item").filter({ hasText: "后勤端" }),
  ).toContainText("等待页面就绪");
  await expect(
    page
      .getByRole("dialog", { name: "成果链接" })
      .getByRole("button", { name: "重试", exact: true }),
  ).toBeVisible({ timeout: 25000 });
  await page
    .getByRole("dialog", { name: "成果链接" })
    .getByRole("button", { name: "重试", exact: true })
    .click();
  await login(staff);
  await expect(
    page.locator(".utility-panel .preview-item").filter({ hasText: "后勤端" }),
  ).toContainText("目标页面已就绪");
});
for (const width of [1366, 1920])
  test(`离线资源与版面 ${width}`, async ({ page, context, request }) => {
    const state = await newRun(request, 3);
    const external: string[] = [];
    await context.route("**/*", (route) => {
      if (
        !["localhost", "127.0.0.1"].includes(
          new URL(route.request().url()).hostname,
        )
      ) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 768 });
    await page.goto(workbench);
    await expect(
      page.getByRole("heading", { name: "应用搭建工作台", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("main", { name: "连续工作流画布" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "自动总装", exact: true }).click();
    await page.screenshot({
      path: `test-results/workbench-${width}.png`,
      fullPage: true,
    });
    for (const terminal of ["public", "ops", "mobile", "staff", "admin"]) {
      const preview = await context.newPage();
      await preview.goto(url(state.run, terminal));
      if (["staff", "admin"].includes(terminal)) await login(preview, terminal);
      if (["public", "ops"].includes(terminal))
        await expect(preview.locator(".scene-shell")).toHaveAttribute(
          "data-intro-state",
          "ready",
          { timeout: 45000 },
        );
      expect(await preview.locator("body").innerText()).not.toMatch(
        /林悦|陈越|陈晨|顾宁|周然|宋怡|许安|徐静|李知|预制|模拟|真实执行|非真实 AI/,
      );
      await preview.close();
    }
    expect(external).toEqual([]);
  });

test("任意文件导入、卡内编辑、退回与刷新，预览可分别回看", async ({
  page,
  request,
  context,
}) => {
  const state = await newRun(request);
  await page.goto(workbench);
  const source = page.getByTestId("node-01-map");
  await source.locator("input[type=file]").setInputFiles({
    name: "随便的文件.xyz",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("no validation"),
  });
  await expect(source).toHaveAttribute("data-status", "complete");
  await page.reload();
  await expect(source).toContainText("随便的文件.xyz");
  await assemble(page, "01");
  const node = page.getByTestId("node-01-acceptance");
  await node.getByLabel("验收观察").fill("需要重新调整视角");
  await node.getByRole("button", { name: "退回调整" }).click();
  const adjustment = page.getByTestId("node-01-adjustment");
  await expect(adjustment).toHaveAttribute("data-status", "ready");
  await locate(page, "01-adjustment");
  const before = await page.locator(".canvas-world").getAttribute("style");
  await adjustment.getByLabel("修改说明").fill("重做默认视角");
  expect(await page.locator(".canvas-world").getAttribute("style")).toBe(
    before,
  );
  await adjustment
    .getByRole("button", { name: "提交调整", exact: true })
    .click();
  await adjustment
    .getByRole("button", { name: "确认组装", exact: true })
    .click();
  await expect(node).toHaveAttribute("data-status", "waiting");
  await locate(page, "01-acceptance");
  await accept(page, "01");
  await assembleApi(request, state.run, "02");
  await assembleApi(request, state.run, "03");
  for (const stage of ["01", "02", "03"]) {
    const preview = await context.newPage();
    await preview.goto(url(state.run, "public", stage));
    if (stage === "01")
      await expect(preview.locator(".space-only")).toBeVisible();
    else {
      await expect(preview.locator(".space-only")).toHaveCount(0);
      await expect(preview.locator(".app.public")).toBeVisible();
      await expect(preview.locator(".scene-shell")).toHaveAttribute(
        "data-intro-state",
        "ready",
        { timeout: 45000 },
      );
    }
    await expect(preview).toHaveURL(new RegExp("stage=" + stage));
    await preview.close();
  }
  const result = await (
    await request.get(`${api}/api/runs/${state.run}/report`)
  ).json();
  expect(
    result.history.some(
      (h: any) =>
        h.kind === "acceptance" && h.detail.includes("需要重新调整视角"),
    ),
  ).toBe(true);
});

test("上游调整使已打开成果过期，重新生成后原窗口恢复且业务不丢失", async ({
  page,
  request,
}) => {
  const state = await newRun(request, 3);
  await page.goto(url(state.run, "staff"));
  await login(page);
  const root = `${api}/api/runs/${state.run}`;
  const auth = await (
    await request.post(root + "/session", {
      data: { username: "staff01", password: "123456", terminal: "staff" },
    })
  ).json();
  expect(
    (
      await request.post(root + "/records/tasks/T1/claim", {
        headers: { Authorization: `Bearer ${auth.token}` },
        data: {},
      })
    ).ok(),
  ).toBeTruthy();
  const edit = await request.post(root + "/node", {
    data: { node: "03-adjustment", action: "submit", text: "重新核对接口返回" },
  });
  expect(edit.ok()).toBeTruthy();
  await expect(page.getByRole("alert")).toContainText("本阶段成果尚未就绪", {
    timeout: 8000,
  });
  expect(
    (
      await request.post(root + "/node", {
        data: { node: "03-adjustment", action: "confirm" },
      })
    ).ok(),
  ).toBeTruthy();
  await waitNode(request, "03-acceptance", "waiting");
  await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole("button", { name: "进入工作台" })).toHaveCount(0);
  const data = await (await request.get(root + "/records")).json();
  expect(data.records.tasks.find((t: any) => t.id === "T1").status).toBe(
    "处理中",
  );
});

test("文件选择器事件、排队导入、错误持久显示及手动重试", async ({
  page,
  request,
}) => {
  await newRun(request);
  await page.goto(workbench);
  await locate(page, "01-map");
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  let intercepted = false;
  await page.route("**/api/runs/*/node", async (route) => {
    if (!intercepted && route.request().postDataJSON().node === "01-map") {
      intercepted = true;
      await hold;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "导入服务暂不可用，请重试" }),
      });
    } else await route.continue();
  });
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByTestId("node-01-map")
    .getByRole("button", { name: "选择文件：图片地图", exact: true })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "Mac 文件 任意.xyz",
    mimeType: "application/x-demo",
    buffer: Buffer.from("input"),
  });
  const map = page.getByTestId("node-01-map"),
    coordinates = page.getByTestId("node-01-coordinates");
  await expect(map.locator(".submit-state")).toHaveText("提交中…");
  await coordinates.locator("input[type=file]").setInputFiles({
    name: "第二份材料.bin",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("next"),
  });
  await expect(coordinates.locator(".submit-state")).toHaveText("排队中");
  release();
  await expect(coordinates).toHaveAttribute("data-status", "complete");
  await expect(map.getByRole("alert")).toContainText("导入服务暂不可用");
  await expect
    .poll(async () => (await request.get(api + "/api/workbench")).ok())
    .toBe(true);
  await map.getByRole("button", { name: "重试提交", exact: true }).click();
  await expect(map).toHaveAttribute("data-status", "complete");
  await expect(map.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(map).toContainText("Mac 文件 任意.xyz");
  await expect(coordinates).toContainText("第二份材料.bin");
});

test("旧轮询响应不能撤销已确认的文件导入", async ({ page, request }) => {
  await newRun(request);
  await page.goto(workbench);
  await locate(page, "01-map");
  const previous = await (await request.get(api + "/api/workbench")).json();
  let release!: () => void, seen!: () => void;
  const held = new Promise<void>((r) => (release = r)),
    captured = new Promise<void>((r) => (seen = r));
  let intercepted = false;
  await page.route("**/api/workbench", async (route) => {
    if (!intercepted) {
      intercepted = true;
      seen();
      await held;
      await route.fulfill({ json: previous });
    } else await route.continue();
  });
  await captured;
  const map = page.getByTestId("node-01-map");
  await map.locator("input[type=file]").setInputFiles({
    name: "不能被撤销.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(map).toHaveAttribute("data-status", "complete");
  release();
  await expect(map).toContainText("不能被撤销.txt");
  await expect
    .poll(async () => map.getAttribute("data-status"))
    .toBe("complete");
});

test("运行、内容展开和轮询不移动镜头，刷新恢复镜头，新轮次显示全图", async ({
  page,
  request,
}) => {
  await newRun(request);
  const snapshot = await (await request.get(api + "/api/workbench")).json();
  for (const id of ["01-map", "01-requirement", "01-outline"])
    Object.assign(snapshot.state.nodes[id], {
      status: "complete",
      output: "区域识别输出",
    });
  Object.assign(snapshot.state.nodes["01-svg"], {
    status: "running",
    startedAt: new Date().toISOString(),
    durationMs: 25000,
  });
  await page.route("**/api/workbench", (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.goto(workbench);
  await locate(page, "01-outline");
  const world = page.locator(".canvas-world"),
    before = await world.getAttribute("style");
  const nodes = page.locator(".node-position");
  const geometry = await nodes.evaluateAll((els) =>
    els.map((e) => e.getAttribute("style")),
  );
  await page
    .getByTestId("node-01-outline")
    .getByText("输出详情", { exact: true })
    .click();
  await page
    .getByTestId("node-01-outline")
    .locator(".process-scroll")
    .evaluate((el) => {
      el.append(
        Object.assign(document.createElement("p"), {
          textContent: "长日志".repeat(400),
        }),
      );
    });
  await page.waitForTimeout(900);
  expect(await world.getAttribute("style")).toBe(before);
  expect(
    await nodes.evaluateAll((els) => els.map((e) => e.getAttribute("style"))),
  ).toEqual(geometry);
  await page.reload();
  await expect(world).toHaveAttribute("style", before!);
  await page.unroute("**/api/workbench");
  await page.getByRole("button", { name: "开始新流程", exact: true }).click();
  await expect.poll(() => world.getAttribute("style")).not.toBe(before);
  await expect(page.getByRole("button", { name: "跟随流程" })).toHaveCount(0);
});

for (const size of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
])
  test(`分支画布手势、禁止选字、聚焦不滚动及模块布局 ${size.width}`, async ({
    page,
    request,
  }) => {
    await newRun(request);
    await page.setViewportSize(size);
    await page.goto(workbench);
    await locate(page, "01-map");
    const header = page.getByTestId("node-01-map").locator(".node-header");
    const box = (await header.boundingBox())!;
    const before = await page.locator(".canvas-world").getAttribute("style");
    await page.mouse.move(box.x + 90, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 210, box.y + 90, { steps: 8 });
    await page.mouse.up();
    expect(await page.locator(".canvas-world").getAttribute("style")).not.toBe(
      before,
    );
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      "",
    );
    const still = await page.locator(".canvas-world").getAttribute("style");
    await page
      .getByTestId("node-01-map")
      .locator(".node-description")
      .dblclick();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
      "",
    );
    expect(await page.locator(".canvas-world").getAttribute("style")).toBe(
      still,
    );
    await locate(page, "03-adjustment");
    await page
      .getByTestId("node-03-adjustment")
      .getByLabel("修改说明", { exact: true })
      .fill("保留输入能力");
    expect(
      await page.locator(".canvas-viewport").evaluate((el) => el.scrollTop),
    ).toBe(0);
    expect(
      await page.locator(".canvas-viewport").evaluate((el) => el.scrollLeft),
    ).toBe(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "空间构建", exact: true }).click();
    const rectangles = await page
      .locator('[data-node-id^="01-"]')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return {
            id: el.getAttribute("data-node-id"),
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          };
        }),
      );
    for (let i = 0; i < rectangles.length; i++)
      for (let j = i + 1; j < rectangles.length; j++) {
        const a = rectangles[i],
          b = rectangles[j];
        expect(
          a.x + a.width <= b.x + 1 ||
            b.x + b.width <= a.x + 1 ||
            a.y + a.height <= b.y + 1 ||
            b.y + b.height <= a.y + 1,
          `${a.id} overlaps ${b.id}`,
        ).toBeTruthy();
      }
    await page.screenshot({ path: `test-results/branches-${size.width}.png` });
    await page.getByRole("button", { name: "全图", exact: true }).click();
    await page.screenshot({
      path: `test-results/branches-overview-${size.width}.png`,
    });
  });

test("批量导入、多次追加去重、拖放、取消、移除和参考替换", async ({
  page,
  request,
}) => {
  await newRun(request);
  await page.goto(workbench);
  await locate(page, "02-pages");
  const card = page.getByTestId("node-02-pages"),
    input = card.locator("input[type=file]");
  const a = {
      name: "页面一.html",
      mimeType: "text/html",
      buffer: Buffer.from("<section>一</section>"),
    },
    b = {
      name: "任意二.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("二"),
    };
  const chooser = page.waitForEvent("filechooser");
  await card.locator(".drop-input").click();
  expect((await chooser).isMultiple()).toBeTruthy();
  await input.setInputFiles([a, b]);
  await expect(card.locator(".file-row")).toHaveCount(2);
  const getState = async () =>
    (await (await request.get(api + "/api/workbench")).json()).state;
  const revision = (await getState()).revision;
  // Preserve file identity metadata across repeated selections.
  const current = (await getState()).nodes["02-pages"].files[0];
  await page.evaluate(async (file) => {
    await fetch(
      `http://localhost:5507/api/runs/${(await (await fetch("http://localhost:5507/api/workbench")).json()).state.run}/node`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node: "02-pages",
          action: "import",
          files: [file],
        }),
      },
    );
  }, current);
  expect((await getState()).revision).toBe(revision);
  await input.setInputFiles([]);
  await expect(card.locator(".file-row")).toHaveCount(2);
  await card.locator(".drop-input").evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(
      new File(["three"], "第三份.svg", { type: "image/svg+xml" }),
    );
    data.items.add(
      new File(["four"], "第四份.json", { type: "application/json" }),
    );
    el.dispatchEvent(
      new DragEvent("drop", { bubbles: true, dataTransfer: data }),
    );
  });
  await expect(card.locator(".file-row")).toHaveCount(4);
  await card
    .getByRole("button", { name: "移除 任意二.txt", exact: true })
    .click();
  await expect(card.locator(".file-row")).toHaveCount(3);
  await page.reload();
  await expect(card.locator(".file-row")).toHaveCount(3);
  await card.getByRole("button", { name: "载入参考素材", exact: true }).click();
  await expect(card.locator(".file-row")).toHaveCount(5);
  expect(
    (await getState()).nodes["02-pages"].files.map((f: any) => f.name),
  ).toEqual([
    "public-pages.html",
    "ops-pages.html",
    "mobile-pages.html",
    "staff-pages.html",
    "admin-pages.html",
  ]);
  for (const name of [
    "public-pages.html",
    "ops-pages.html",
    "mobile-pages.html",
    "staff-pages.html",
    "admin-pages.html",
  ])
    await card
      .getByRole("button", { name: "移除 " + name, exact: true })
      .click();
  await expect(card).toHaveAttribute("data-status", "ready");
});

for (const size of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
])
  test(`五个成果链接常显、卡片固定和运行配色 ${size.width}`, async ({
    page,
    request,
  }) => {
    await newRun(request, 3);
    await page.setViewportSize(size);
    await page.goto(workbench);
    for (const id of ["02-acceptance", "03-acceptance"]) {
      await locate(page, id);
      const card = page.getByTestId("node-" + id);
      const cardBox = (await card.boundingBox())!;
      await expect(card.getByRole("link")).toHaveCount(5);
      for (const a of await card.getByRole("link").all()) {
        await expect(a).toBeInViewport({ ratio: 1 });
        const r = (await a.boundingBox())!;
        expect(r.y).toBeGreaterThan(cardBox.y);
        expect(r.y + r.height).toBeLessThan(cardBox.y + cardBox.height);
        expect(await a.getAttribute("href")).toMatch(/localhost:550[0-4]/);
      }
      expect(
        await card
          .locator(".preview-links")
          .evaluate((el) => el.scrollHeight <= el.clientHeight),
      ).toBe(true);
    }
    const snapshot = await (await request.get(api + "/api/workbench")).json();
    for (const id of ["01-outline", "01-coordinate-plan"])
      snapshot.state.nodes[id].status = "running";
    snapshot.state.nodes["03-acceptance"].status = "waiting";
    snapshot.state.nodes["01-reference-plan"].status = "invalidated";
    await page.route("**/api/workbench", (route) =>
      route.fulfill({ json: snapshot }),
    );
    await page.reload();
    const color = (id: string) =>
      page
        .getByTestId("node-" + id)
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    await expect(page.getByTestId("node-01-outline")).toHaveAttribute(
      "data-status",
      "running",
    );
    expect(await color("01-outline")).toBe(await color("01-coordinate-plan"));
    expect(await color("01-outline")).toBe(await color("03-acceptance"));
    expect(await color("01-outline")).not.toBe(
      await color("01-reference-plan"),
    );
    expect(await color("01-outline")).not.toBe(await color("02-roles"));
    expect(
      await page
        .getByTestId("node-03-acceptance")
        .locator(".state-dot")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
  });
