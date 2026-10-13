import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const captures = ".local/mobile-visual";
mkdirSync(captures, { recursive: true });
test("贴边底栏、无停车导览及清透页面", async ({ page }) => {
  for (const width of [320, 390, 430, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/#/pages/home/index");
    await expect(page.locator(".bottom-nav")).toBeVisible();
    const box = await page.locator(".bottom-nav").boundingBox();
    expect(box!.x).toBe(0);
    expect(box!.width).toBe(width);
    expect(Math.round(box!.y + box!.height)).toBe(844);
    expect(
      await page
        .locator("uni-page-body")
        .evaluate((el) => getComputedStyle(el).backgroundImage),
    ).toContain("data:image/png;base64");
    await page.screenshot({
      path: `${captures}/home-${width}.png`,
      fullPage: true,
    });
    await page.goto("/#/pages/guide/index");
    await expect(page.locator(".filters")).toBeVisible();
    await expect(
      page.locator(".filters").getByText("停车", { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: `${captures}/guide-${width}.png`,
      fullPage: true,
    });
    await page.goto("/#/pages/qa/index");
    await expect(page.getByText("景点介绍", { exact: true })).toBeVisible();
    await page.screenshot({
      path: `${captures}/qa-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("工作台推荐、连续回答、引用、历史与新对话", async ({ page }) => {
  const messages: any[] = [];
  let submitted: any;
  const reply =
    "## 沿湖慢行\n\n可以欣赏**湖面与山色**。\n- 留意沿途指引\n- 选择适合自己的节奏 [K1]";
  await page.route("**/api/v1/qa/conversations**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.endsWith("/messages") && request.method() === "POST") {
      submitted = request.postDataJSON();
      const id = "answer-" + messages.length;
      messages.push({
        id: "question-" + id,
        role: "user",
        text: submitted.text,
        status: "completed",
        sources: [],
        createdAt: new Date().toISOString(),
      });
      const sources = [
        {
          id: "poi-lake",
          title: "镜湖栈道",
          excerpt: "沿湖观景，请留意开放状态。",
          kind: "scenic",
          version: "1",
          citation: "K1",
        },
      ];
      messages.push({
        id,
        role: "assistant",
        text: reply,
        status: "completed",
        sources,
        createdAt: new Date().toISOString(),
      });
      const events = [
        ["start", { conversationId: "conversation", messageId: id }],
        ["delta", { text: reply }],
        ["sources", { sources }],
        ["done", { status: "completed" }],
      ];
      await route.fulfill({
        contentType: "text/event-stream",
        body: events
          .map(
            ([event, data]) =>
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          )
          .join(""),
      });
    } else if (url.pathname.endsWith("/messages")) {
      await route.fulfill({ json: { data: { items: messages } } });
    } else if (request.method() === "POST") {
      await route.fulfill({ json: { data: { id: "conversation" } } });
    } else
      await route.fulfill({
        json: {
          data: {
            items: [
              {
                id: "conversation",
                poiId: "lake",
                createdAt: new Date().toISOString(),
              },
            ],
          },
        },
      });
  });
  await page.goto("/#/pages/qa/index?poiId=lake");
  await expect(page.getByText("当前景点 · 镜湖栈道")).toBeVisible();
  await page
    .locator(".suggestion")
    .filter({ hasText: "介绍一下镜湖栈道" })
    .click();
  await expect(page.locator(".answer-body")).toContainText("沿湖慢行");
  expect(submitted).toEqual({ text: "介绍一下镜湖栈道" });
  await expect(page.locator(".welcome")).toHaveCount(0);
  await page.getByText(/参考来源/).click();
  await expect(page.locator(".source")).toContainText("镜湖栈道");
  await expect(page.locator(".emphasis")).toHaveText("湖面与山色");
  await page.locator("textarea").fill("还有哪些建议？");
  await page.getByText("发送", { exact: true }).click();
  await expect(page.locator(".answer-card")).toHaveCount(2);
  await expect(page.locator("textarea")).toHaveValue("");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const answers = document.querySelectorAll(".answer-card");
        return (
          answers[answers.length - 1].getBoundingClientRect().bottom <=
          document.querySelector(".composer")!.getBoundingClientRect().top
        );
      }),
    )
    .toBe(true);
  await page.screenshot({
    path: `${captures}/qa-conversation.png`,
    fullPage: false,
  });
  await page.getByText("历史", { exact: true }).click();
  await expect(page.locator(".history-item")).toHaveCount(1);
  await page.locator(".history-item").click();
  await expect(page.locator(".answer-card")).toHaveCount(2);
  await page.getByText("新对话", { exact: true }).click();
  await expect(page.locator(".welcome")).toBeVisible();
  await expect(page.locator(".answer-card")).toHaveCount(0);
  await page.getByText("移除", { exact: true }).click();
  await expect(page.locator(".context")).toHaveCount(0);
});

test("后端关闭状态在调试、导览与详情中一致", async ({ page }) => {
  await page.goto("/#/pages/demo/index");
  const lake = page.locator(".list-item").filter({ hasText: "镜湖栈道" });
  await expect(lake).toBeVisible();
  await expect(page.getByText("正在更新景区状态…")).toHaveCount(0);
  const changed = page.waitForResponse(
    (r) => r.url().includes("/debug/scenic/state") && r.status() === 200,
  );
  await lake.locator("uni-switch").click();
  await changed;
  await page.goto("/#/pages/detail/index?id=lake");
  await expect(page.getByText("开放", { exact: true })).toBeVisible();
  await page.goto("/#/pages/guide/index");
  await expect(page.getByText("正在更新景区状态…")).toHaveCount(0);
  await expect(
    page.locator(".list-item").filter({ hasText: "镜湖栈道" }),
  ).toContainText("查看");
});
