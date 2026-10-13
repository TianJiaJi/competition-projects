import { afterEach, describe, expect, it, vi } from "vitest";
import { bootContext, BUSINESS_KEY, SESSION_KEY } from "./helpers";
import { bootstrap, checkStorageChanges, configureRuntime, getStore, resetSample, subscribeRuntime } from "../../src/services/store";
import { readStore } from "../../src/core/storage";
import { createArticle, createNotice, saveScenic } from "../../src/services/content";
import { adminListSlots, saveSlotCapacity } from "../../src/services/orders";
import type { BusinessStore } from "../../src/core/types";

afterEach(() => vi.restoreAllMocks());

describe("存储冲突与失败恢复", () => {
  it("写入前发现另一标签的修改，拒绝旧快照及恢复操作，重新加载后可以保存", async () => {
    const { storage, rawStore } = bootContext();
    const old = structuredClone(getStore());
    const other = structuredClone(old);
    other.global.articles[0].title = "另一标签保存的内容";
    other.revision += 1;
    storage.setItem(BUSINESS_KEY, JSON.stringify(other));
    const listener = vi.fn();
    const unsubscribe = subscribeRuntime(listener);
    try {
      const response = await saveScenic({ ...old.global.scenic, name: "当前标签草稿" });
      expect(response).toMatchObject({ ok: false, error: { code: "MOCK_STORAGE_CONFLICT" } });
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: "conflict" }));
      expect(resetSample().ok).toBe(false);
      expect(JSON.parse(rawStore()!)).toEqual(other);
      expect(getStore()).toEqual(old);
      configureRuntime({ storage });
      expect(bootstrap().status).toBe("ready");
      expect((await saveScenic({ ...old.global.scenic, name: "重新加载后保存" })).ok).toBe(true);
      const saved = JSON.parse(rawStore()!);
      expect(saved.global.articles[0].title).toBe(other.global.articles[0].title);
      expect(saved.global.scenic.name).toBe("重新加载后保存");
    } finally {
      unsubscribe();
    }
  });

  it.each(["相同 revision 的重建", "删除业务键", "损坏业务键"])("检测%s，不静默覆盖", (change) => {
    const { storage } = bootContext();
    if (change === "相同 revision 的重建") {
      const changed = structuredClone(getStore());
      changed.global.scenic.name = "重建后的样例";
      storage.setItem(BUSINESS_KEY, JSON.stringify(changed));
    } else if (change === "删除业务键") storage.removeItem(BUSINESS_KEY);
    else storage.setItem(BUSINESS_KEY, "{invalid");
    expect(checkStorageChanges().status).toBe("conflict");
    expect(resetSample().ok).toBe(false);
  });

  it("恢复样例写入失败保留旧数据、内存和会话，恢复写入后可以重试", async () => {
    const { storage, rawStore } = bootContext();
    await saveScenic({ ...getStore().global.scenic, name: "恢复前的名称" });
    storage.setItem(SESSION_KEY, "session-to-preserve");
    storage.setItem("qinglan.visitor.sample", "visitor-to-preserve");
    const before = rawStore();
    const memoryBefore = getStore();
    storage.failWrites = true;
    expect(resetSample()).toMatchObject({ ok: false, error: { code: "MOCK_STORAGE_FAILED" } });
    expect(rawStore()).toBe(before);
    expect(getStore()).toBe(memoryBefore);
    storage.failWrites = false;
    expect(resetSample().ok).toBe(true);
    expect(getStore().global.scenic.name).toBe("青岚山境");
    expect(storage.getItem(SESSION_KEY)).toBe("session-to-preserve");
    expect(storage.getItem("qinglan.visitor.sample")).toBe("visitor-to-preserve");
  });

  it("临时读取失败阻止保存但不覆盖已有数据，恢复后可重试", async () => {
    const { storage, rawStore } = bootContext();
    const input = { ...getStore().global.scenic, name: "读取恢复后保存" };
    const before = rawStore();
    const read = vi.spyOn(storage, "getItem").mockImplementation(() => { throw new Error("读取被拒绝"); });
    expect((await saveScenic(input)).ok).toBe(false);
    read.mockRestore();
    expect(rawStore()).toBe(before);
    expect((await saveScenic(input)).ok).toBe(true);
  });
});

const corruptions: Array<[string, (store: BusinessStore) => void]> = [
  ["检修计划集合缺失", (store) => { Reflect.deleteProperty(store.global, "inspectionPlans"); }],
  ["当前运行不存在", (store) => { store.runs = {}; }],
  ["景区资料为 null", (store) => { Reflect.set(store.global, "scenic", null); }],
  ["订单历史结构损坏", (store) => { Reflect.set(store.runs[store.activeRunId].orders[0], "history", null); }],
  ["告警时间线结构损坏", (store) => { Reflect.set(store.runs[store.activeRunId].alerts[0], "records", {}); }],
  ["知识关键词结构损坏", (store) => { Reflect.set(store.global.knowledge[0], "keywords", null); }],
  ["卫生间分项缺失", (store) => { Reflect.deleteProperty(store.runs[store.activeRunId].restroomBaselines.t1, "female"); }],
  ["运行 ID 不匹配", (store) => { store.runs[store.activeRunId].runId = "different-run"; }],
];

describe("部分损坏可恢复", () => {
  it.each(corruptions)("%s不抛出初始化异常，也不覆盖原内容", async (_name, damage) => {
    const { storage, rawStore } = bootContext();
    const broken = structuredClone(getStore());
    damage(broken);
    const original = JSON.stringify(broken);
    storage.setItem(BUSINESS_KEY, original);
    configureRuntime({ storage });
    expect(readStore(storage).status).toBe("corrupt");
    expect(bootstrap()).toMatchObject({ status: "corrupt", message: expect.stringContaining("恢复样例") });
    expect((await saveScenic({ ...getStore().global.scenic, name: "不能保存" })).ok).toBe(false);
    expect(rawStore()).toBe(original);
    expect(resetSample().ok).toBe(true);
    expect(readStore(storage).status).toBe("ok");
  });
});

describe("新增发布与配额服务回归", () => {
  const article = { category: "guide" as const, title: "发布测试", summary: "摘要", body: "正文", coverUrl: "/assets/scenic-landscape.svg", published: true };
  const notice = { title: "发布测试", body: "正文", audience: "public" as const, startsAt: "2026-09-12T14:00", endsAt: "2026-09-12T15:00", published: true };
  it.each(["article", "notice"])("%s 新增发布失败不留下草稿，重试只创建一份已发布内容", async (kind) => {
    const { storage, rawStore } = bootContext();
    const create = () => kind === "article" ? createArticle(article) : createNotice(notice);
    const before = rawStore();
    storage.failWrites = true;
    expect(await create()).toMatchObject({ ok: false, error: { code: "MOCK_STORAGE_FAILED" } });
    expect(rawStore()).toBe(before);
    storage.failWrites = false;
    const write = vi.spyOn(storage, "setItem");
    expect(await create()).toMatchObject({ ok: true, data: { published: true } });
    expect(write).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(rawStore()!);
    const original = JSON.parse(before!);
    const list = kind === "article" ? saved.global.articles : saved.runs[saved.activeRunId].notices;
    const oldList = kind === "article" ? original.global.articles : original.runs[original.activeRunId].notices;
    expect(list).toHaveLength(oldList.length + 1);
    expect(list.at(-1).published).toBe(true);
  });

  it.each(["admission", "parking"] as const)("%s 已结束档服务层拒绝修改，尚未结束档可以保存", async (type) => {
    const { rawStore } = bootContext();
    const slots = await adminListSlots({ type, date: "2026-09-12" });
    if (!slots.ok) throw new Error("时段读取失败");
    const ended = slots.data.find((slot) => slot.start === "08:00")!;
    const before = rawStore();
    expect(await saveSlotCapacity({ slotId: ended.id, interactiveQuota: ended.interactiveQuota + 1 }))
      .toMatchObject({ ok: false, error: { code: "ORDER_STATE_CONFLICT" } });
    expect(rawStore()).toBe(before);
    const active = slots.data.find((slot) => slot.start === "14:00")!;
    expect((await saveSlotCapacity({ slotId: active.id, interactiveQuota: active.interactiveQuota + 1 })).ok).toBe(true);
  });

  it("入园查询忽略残留停车场条件", async () => {
    bootContext();
    const slots = await adminListSlots({ type: "admission", date: "2026-09-12", lotId: "p1" });
    expect(slots.ok && slots.data.length).toBe(9);
  });
});
