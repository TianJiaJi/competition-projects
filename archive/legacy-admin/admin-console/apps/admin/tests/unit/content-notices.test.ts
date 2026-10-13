import { beforeEach, describe, expect, it } from "vitest";
import { bootContext, type TestContext } from "./helpers";
import { adminListArticles, adminListNotices, createArticle, deleteArticle, getScenic, saveArticle, savePoiContent, saveScenic } from "../../src/services/content";
import { isCatalogueImage, isSafeUrl, parseMarkdown, findUnsafeUrls } from "../../src/core/markdown";
import { noticeEffectiveState } from "../../src/core/time";
import { assetCatalogue } from "../../src/core/assets";

describe("内容、公告与 Markdown 安全（ADM-03~ADM-06）", () => {
  let ctx: TestContext;
  beforeEach(() => {
    ctx = bootContext();
  });

  it("AC-06：固定 14:30 下的生效状态按左闭右开计算", async () => {
    const notices = await adminListNotices({ pageSize: 50 });
    expect(notices.ok).toBe(true);
    if (!notices.ok) return;
    const find = (title: string) => notices.data.items.find((notice) => notice.title.includes(title));
    expect(find("今日索道运营正常")?.effectiveState).toBe("active");
    expect(find("峡谷段短时限流预告")?.effectiveState).toBe("pending");
    expect(find("午后客流提示")?.effectiveState).toBe("expired");
    expect(find("清晨设备检查")?.effectiveState).toBe("expired");
    expect(find("周末团队预约安排")?.effectiveState).toBe("unpublished");
    expect(find("内部值班交接提醒")?.audience).toBe("internal");
    expect(noticeEffectiveState({ published: true, startsAt: "2026-09-12T14:30:00+08:00", endsAt: "2026-09-12T15:00:00+08:00" })).toBe("active");
    expect(noticeEffectiveState({ published: true, startsAt: "2026-09-12T13:00:00+08:00", endsAt: "2026-09-12T14:30:00+08:00" })).toBe("expired");
  });

  it("公告筛选按状态与范围先筛后分页", async () => {
    const published = await adminListNotices({ published: true, pageSize: 20 });
    expect(published.ok && published.data.items.every((notice) => notice.published)).toBe(true);
    const internal = await adminListNotices({ audience: "internal" });
    expect(internal.ok && internal.data.items.every((notice) => notice.audience === "internal")).toBe(true);
    const expired = await adminListNotices({ effectiveState: "expired" });
    expect(expired.ok && expired.data.items.every((notice) => notice.effectiveState === "expired")).toBe(true);
  });

  it("AC-03：景区资料校验手机号与必填，保存后持久化", async () => {
    const badPhone = await saveScenic({
      name: "青岚山境",
      summary: "简介",
      address: "地址",
      servicePhone: "abc",
      coverUrl: assetCatalogue[0].url,
      openingText: "营业说明",
    });
    expect(badPhone.ok).toBe(false);
    if (!badPhone.ok) expect(badPhone.error.fieldErrors?.[0].field).toBe("servicePhone");

    const emptyName = await saveScenic({
      name: "   ",
      summary: "简介",
      address: "地址",
      servicePhone: "0571-8888 6688",
      coverUrl: assetCatalogue[0].url,
      openingText: "营业说明",
    });
    expect(emptyName.ok).toBe(false);

    const saved = await saveScenic({
      name: "青岚山境（改名演示）",
      summary: "简介",
      address: "地址",
      servicePhone: "0571-8888 6688",
      coverUrl: assetCatalogue[1].url,
      openingText: "营业说明",
    });
    expect(saved.ok).toBe(true);

    const { readStore } = await import("../../src/core/storage");
    const persisted = readStore(ctx.storage);
    expect(persisted.status).toBe("ok");
    if (persisted.status === "ok") expect(persisted.store.global.scenic.name).toBe("青岚山境（改名演示）");

    const reloaded = await getScenic();
    expect(reloaded.ok && reloaded.data.name).toBe("青岚山境（改名演示）");
    expect(reloaded.ok && reloaded.data.coverUrl).toBe(assetCatalogue[1].url);
  });

  it("AC-04：内容闭环新增→编辑→发布→下架→删除，且分页发生在筛选之后", async () => {
    const first = await adminListArticles({ pageSize: 20, page: 1 });
    expect(first.ok && first.data.total).toBe(22);
    expect(first.ok && first.data.pageCount).toBe(2);
    expect(first.ok && first.data.items.length).toBe(20);
    const second = await adminListArticles({ pageSize: 20, page: 2 });
    expect(second.ok && second.data.items.length).toBe(2);

    const created = await createArticle({
      category: "guide",
      title: "新增演示内容",
      summary: "摘要内容",
      body: "## 新增演示\n\n- 列表项\n\n![示意图](/assets/scenic-landscape.svg)",
      coverUrl: assetCatalogue[0].url,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.published).toBe(false);

    const published = await saveArticle(created.data.id, {
      category: "news",
      title: "新增演示内容（已发布）",
      summary: "摘要内容",
      body: created.data.body,
      coverUrl: created.data.coverUrl,
      published: true,
    });
    expect(published.ok && published.data.published).toBe(true);
    expect(published.ok && published.data.revision).toBe(2);

    const unpublished = await saveArticle(created.data.id, {
      category: "news",
      title: "新增演示内容（已下架）",
      summary: "摘要内容",
      body: created.data.body,
      coverUrl: created.data.coverUrl,
      published: false,
    });
    expect(unpublished.ok && unpublished.data.published).toBe(false);

    const removed = await deleteArticle(created.data.id);
    expect(removed.ok).toBe(true);
    const after = await adminListArticles({ pageSize: 20, page: 2 });
    expect(after.ok && after.data.total).toBe(22);

    const filtered = await adminListArticles({ keyword: "听溪台", pageSize: 20 });
    expect(filtered.ok && filtered.data.items.every((article) => `${article.title}${article.summary}`.includes("听溪台"))).toBe(true);
  });

  it("AC-05：Markdown 拒绝可执行 URL 与清单外图片，原始 HTML 只作为文本", () => {
    expect(isSafeUrl("https://example.com/a")).toBe(true);
    expect(isSafeUrl("#/content/articles")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isCatalogueImage("/assets/scenic-creek.svg")).toBe(true);
    expect(isCatalogueImage("https://evil.example/x.png")).toBe(false);

    const blocks = parseMarkdown("<script>alert(1)</script>\n\n## 标题\n\n- 项目\n\n> 引用\n\n**加粗**与`代码`");
    expect(blocks[0].kind).toBe("raw");
    expect(blocks.some((block) => block.kind === "heading")).toBe(true);
    expect(blocks.some((block) => block.kind === "list")).toBe(true);
    expect(blocks.some((block) => block.kind === "quote")).toBe(true);

    expect(findUnsafeUrls("[危险](javascript:alert(1))").length).toBe(1);
    expect(findUnsafeUrls("![示意图](/assets/scenic-gorge.svg)").length).toBe(0);
  });

  it("正文与封面对非法素材、未知来源与超量图片给出字段错误", async () => {
    const badImage = await createArticle({
      category: "guide",
      title: "非法图片",
      summary: "摘要",
      body: "![外链](https://evil.example/a.png)",
      coverUrl: assetCatalogue[0].url,
    });
    expect(badImage.ok).toBe(false);
    if (!badImage.ok) expect(badImage.error.fieldErrors?.some((error) => error.field === "body")).toBe(true);

    const badCover = await createArticle({
      category: "guide",
      title: "非法封面",
      summary: "摘要",
      body: "正文内容",
      coverUrl: "https://evil.example/cover.png",
    });
    expect(badCover.ok).toBe(false);

    const unknownSource = await savePoiContent("creek", {
      name: "听溪台",
      summary: "简介",
      body: "正文",
      imageUrls: [],
      sourceIds: ["source-not-exist"],
    });
    expect(unknownSource.ok).toBe(false);
    if (!unknownSource.ok) expect(unknownSource.error.fieldErrors?.[0].message).toContain("未知的来源 ID");

    const tooManyImages = await savePoiContent("creek", {
      name: "听溪台",
      summary: "简介",
      body: "正文",
      imageUrls: [
        "/assets/scenic-landscape.svg",
        "/assets/scenic-creek.svg",
        "/assets/scenic-gorge.svg",
        "/assets/scenic-summit.svg",
        "/assets/scenic-landscape.svg?x=1",
        "/assets/scenic-landscape.svg?x=2",
        "/assets/scenic-landscape.svg?x=3",
      ],
      sourceIds: [],
    });
    expect(tooManyImages.ok).toBe(false);
  });

  it("景点内容覆盖不改变共享点位常量", async () => {
    const { pointById } = await import("@scenic/scenic");
    const before = pointById.creek.name;
    const saved = await savePoiContent("creek", {
      name: "听溪台（演示覆盖）",
      summary: "临溪木台。",
      body: "## 听溪台",
      imageUrls: ["/assets/scenic-creek.svg"],
      sourceIds: ["source-02"],
    });
    expect(saved.ok).toBe(true);
    expect(pointById.creek.name).toBe(before);
    expect(pointById.creek.regionId).toBe("Z1");
    expect(pointById.creek.nodeId).toBe("creek");
  });
});
