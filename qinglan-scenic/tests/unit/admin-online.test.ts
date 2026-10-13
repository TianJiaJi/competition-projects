import { testStore } from "../helpers/postgres";
import { it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../../apps/server/src/platform/store";
import { createPlatform } from "../../apps/server/src/platform/service";
import { startAI } from "../../apps/server/src/platform/ai";
import { sources } from "../../apps/server/src/knowledge";
const dispose: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const f of dispose.splice(0).reverse()) await f();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function setup() {
  const fixture = await testStore(),
    store = fixture.store;
  dispose.push(fixture.close);
  const p = createPlatform(store),
    a = (await store.login("admin01", "123456")).user,
    v = (await store.login("visitor01", "123456")).user;
  const r = (await p.write(
    a,
    await p.selected(),
    "new-test-run",
    "/demo/runs",
    { mode: "replay", scenario: "weekday" },
  )) as any;
  return { p, store, a, v, id: r.id };
}
it("核心景点知识包含可持续扩写的固定设定", () => {
  const lore = sources
    .filter((s) => s.id.startsWith("poi-"))
    .map((s) => s.excerpt)
    .join("");
  expect(lore).toContain("核心设定：");
  expect(lore).toContain("听溪台是青岚山境最早的观水点");
  expect(lore).toContain("镜湖栈道沿着一处古老的山间堰湖展开");
  expect(lore).toContain("松风林曾是护林人轮值歇脚的地方");
});
it("AI文本试测及真实消息检测使用模型结果，试测不撤回任何消息", async () => {
  const { p, store, a, v, id } = await setup();
  const message = (await p.write(
    v,
    id,
    "new-visitor-message",
    "/chat/messages",
    { roomId: "lobby", text: "服务很慢，希望改进" },
  )) as any;
  const sample = (await p.write(
    a,
    id,
    "new-sample-check",
    "/admin/moderation/check",
    { text: "检测用句子" },
  )) as any;
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    decision: "pass",
                    reason: "正常意见，予以保留",
                    category: "complaint",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
    ),
  );
  dispose.push(startAI(p, async () => {}));
  await vi.waitFor(
    async () =>
      expect((await store.get<any>("moderation", sample.id, id)).status).toBe(
        "passed",
      ),
    { timeout: 15000 },
  );
  expect((await store.get<any>("moderation", sample.id, id)).status).toBe(
    "passed",
  );
  expect((await store.get<any>("messages", message.id, id)).removed).toBe(
    false,
  );
  expect(await p.all("messages", id)).toHaveLength(1);
  await vi.waitFor(
    async () =>
      expect((await store.get<any>("moderation", message.id, id)).reason).toBe(
        "正常意见，予以保留",
      ),
    { timeout: 10000 },
  );
});
it("未配置模型直接终止审核，不进入重试队列", async () => {
  const { p, store, a, id } = await setup();
  const sample = (await p.write(
    a,
    id,
    "missing-model-check",
    "/admin/moderation/check",
    { text: "试测" },
  )) as any;
  vi.stubEnv("DEEPSEEK_API_KEY", "");
  dispose.push(startAI(p, async () => {}));
  await vi.waitFor(
    async () =>
      expect((await store.get<any>("moderation", sample.id, id)).status).toBe(
        "skipped",
      ),
    { timeout: 10000 },
  );
  expect(await store.get<any>("moderation", sample.id, id)).toMatchObject({
    status: "skipped",
    error: "MODEL_NOT_CONFIGURED",
    attempts: 1,
  });
});
it("模型故障可追溯并等待重试，不伪装检测通过", async () => {
  const { p, store, a, id } = await setup();
  const sample = (await p.write(
    a,
    id,
    "failed-model-check",
    "/admin/moderation/check",
    { text: "试测" },
  )) as any;
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw Error("MODEL_TIMEOUT");
    }),
  );
  dispose.push(startAI(p, async () => {}));
  await vi.waitFor(
    async () =>
      expect((await store.get<any>("moderation", sample.id, id)).status).toBe(
        "retry",
      ),
    { timeout: 10000 },
  );
  expect(await store.get<any>("moderation", sample.id, id)).toMatchObject({
    status: "retry",
    error: "MODEL_TIMEOUT",
    attempts: 1,
  });
});
it("人工公告起止约束、草稿与删除抑制，资讯保留原表单字段", async () => {
  const { p, a, id } = await setup();
  const article = (await p.write(
    a,
    id,
    "save-rich-article",
    "/admin/articles",
    {
      title: "测试资讯",
      body: "正文",
      summary: "摘要",
      category: "news",
      coverUrl: "/assets/scenic-landscape.svg",
      published: true,
    },
  )) as any;
  expect(article).toMatchObject({
    summary: "摘要",
    category: "news",
    coverUrl: "/assets/scenic-landscape.svg",
  });
  const n = (await p.write(a, id, "future-notice-create", "/admin/notices", {
    title: "未来公告",
    body: "正文",
    published: true,
    startsAt: "2026-09-14T11:00:00+08:00",
    expiresAt: "2026-09-14T11:10:00+08:00",
  })) as any;
  expect(
    (await p.snapshot(id)).public.announcements.some((x) => x.id === n.id),
  ).toBe(false);
  await p.write(a, id, "future-notice-delete", "/admin/notices/" + n.id, {
    action: "delete",
    expectedVersion: n.version,
  });
  await p.write(a, id, "jump-to-notice-start", "/demo/clock", {
    time: "2026-09-14T11:01:00+08:00",
    paused: true,
  });
  expect(
    (await p.snapshot(id)).public.announcements.some((x) => x.id === n.id),
  ).toBe(false);
});
it("重复写入不会将检查点嵌套进检查点，回放状态仍可恢复", async () => {
  const { p, store, a, id } = await setup();
  for (let i = 0; i < 24; i++)
    await p.write(a, id, "checkpoint-toggle-" + i, "/demo/employees", {
      enabled: i % 2 === 0,
    });
  const checkpoints = await store.list<any>("checkpoints", id);
  expect(checkpoints.length).toBeGreaterThan(0);
  for (const c of checkpoints) {
    expect(c.rows.some((row: any) => row.collection === "checkpoints")).toBe(
      false,
    );
    expect(JSON.stringify(c).length).toBeLessThan(500000);
  }
});

it("相邻消息独立审核，结果按消息ID与版本留存", async () => {
  const { p, store, v, id } = await setup();
  const first = (await p.write(v, id, "isolated-message-a", "/chat/messages", {
    roomId: "lobby",
    text: "甲消息独有内容",
  })) as any;
  const second = (await p.write(v, id, "isolated-message-b", "/chat/messages", {
    roomId: "lobby",
    text: "乙消息独有内容",
  })) as any;
  const prompts: any[] = [];
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, input) => {
      const prompt = JSON.parse(JSON.parse(input.body).messages[1].content);
      prompts.push(prompt);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  decision: prompt.messageId === first.id ? "review" : "pass",
                  reason: "独立判断",
                  category: "test",
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    }),
  );
  dispose.push(startAI(p, async () => {}));
  await vi.waitFor(
    async () =>
      expect((await store.get<any>("moderation", second.id, id)).status).toBe(
        "passed",
      ),
    { timeout: 15000 },
  );
  await vi.waitFor(
    async () =>
      expect((await store.get<any>("moderation", first.id, id)).status).toBe(
        "pending",
      ),
    { timeout: 15000 },
  );
  expect(prompts.find((p) => p.messageId === second.id)).toMatchObject({
    message: "乙消息独有内容",
    messageVersion: 1,
  });
  expect(
    JSON.stringify(prompts.find((p) => p.messageId === second.id)),
  ).not.toContain("甲消息独有内容");
  expect(
    await store.get("moderation-results", first.id + "|1", id),
  ).toBeTruthy();
  expect(
    await store.get("moderation-results", second.id + "|1", id),
  ).toBeTruthy();
});

it("发布知识进入问答模型资料，停用后不再进入检索", async () => {
  const { store, p, a, id } = await setup();
  const { knowledgeContext } =
    await import("../../apps/server/src/platform/knowledge-library");
  const { generate } = await import("../../apps/server/src/model");
  const row = (await p.write(
    a,
    id,
    "publish-qa-knowledge",
    "/admin/knowledge",
    {
      title: "验收新知识",
      body: "验收专属内容：服务台提供蓝色雨衣",
      published: true,
    },
  )) as any;
  const snapshot = (await p.snapshot(id)).public;
  const selected = await knowledgeContext(store, "验收新知识", null, snapshot);
  vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
  vi.stubEnv("DEEPSEEK_BASE_URL", "https://example.invalid");
  let prompt = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, input) => {
      prompt = JSON.parse(input.body).messages[0].content;
      return new Response(
        'data: {"choices":[{"delta":{"content":"服务台提供蓝色雨衣。[K1]"}}]}\n\ndata: [DONE]\n\n',
        { status: 200 },
      );
    }),
  );
  let answer = "";
  await generate(
    [{ role: "user", content: "雨衣有什么颜色" }],
    selected,
    (text) => {
      answer += text;
    },
    new AbortController().signal,
  );
  expect(prompt).toContain("验收专属内容：服务台提供蓝色雨衣");
  expect(answer).toContain("[K1]");
  await p.write(a, id, "disable-qa-knowledge", "/admin/knowledge/" + row.id, {
    action: "disable",
    expectedVersion: row.version,
  });
  expect(
    (await knowledgeContext(store, "验收新知识", null, snapshot)).some((s) =>
      s.excerpt.includes("蓝色雨衣"),
    ),
  ).toBe(false);
});
