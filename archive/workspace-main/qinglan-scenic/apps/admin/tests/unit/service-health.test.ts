import { describe, expect, it } from "vitest";
import { isServiceStatusSnapshot, serviceHealthCards } from "../../src/core/service-health";
import { createServiceStatusSample } from "../fixtures/service-status";
import { getServiceStatus } from "../../src/services/system";
import { bootContext, expireSession } from "./helpers";

describe("模块节点健康率", () => {
  it.each([
    [3, 0, 0, "100%"], [2, 1, 0, "66.7%"], [0, 3, 0, "0%"],
    [7, 0, 1, "87.5%"], [0, 0, 3, "0%"], [0, 0, 0, "—"],
  ])("健康 %i 异常 %i 未知 %i → %s", (healthyCount, abnormalCount, unknownCount, percentage) => {
    const sample = createServiceStatusSample();
    Object.assign(sample.modules[0]!, { healthyCount, abnormalCount, unknownCount });
    const card = serviceHealthCards(sample.modules)[0]!;
    expect(card.available).toBe(true);
    expect(card.percentage).toBe(percentage);
    expect(card.total).toBe(healthyCount + abnormalCount + unknownCount);
    if (card.total) {
      expect(card.healthyPercent + card.abnormalPercent).toBeCloseTo((healthyCount + abnormalCount) / card.total * 100);
    } else expect(card.message).toBe("暂无检测数据");
  });

  it.each([-1, 1.5, NaN, Infinity, "3", null, undefined, Number.MAX_SAFE_INTEGER + 1])("非法计数 %s 不补零或显示健康", value => {
    const sample = createServiceStatusSample();
    const cards = serviceHealthCards([{ ...sample.modules[0], healthyCount: value }, ...sample.modules.slice(1)]);
    expect(cards[0]).toMatchObject({ available: false, percentage: "—", message: "检测数据不可用" });
    expect(cards[1]!.available).toBe(true);
  });

  it("计数和溢出、模块重复、缺失和时间损坏只影响对应模块", () => {
    const sample = createServiceStatusSample();
    const broken = [
      { ...sample.modules[0], healthyCount: Number.MAX_SAFE_INTEGER },
      sample.modules[1], sample.modules[1],
      { ...sample.modules[2], checkedAt: "invalid" },
      ...sample.modules.slice(4),
    ];
    const cards = serviceHealthCards(broken);
    expect(cards.slice(0, 4).every(card => !card.available)).toBe(true);
    expect(cards.slice(4).every(card => card.available)).toBe(true);
  });

  it("乱序不影响七卡顺序，额外模块不生成新卡片", () => {
    const sample = createServiceStatusSample();
    const cards = serviceHealthCards([{ id: "future" }, ...sample.modules.reverse()]);
    expect(cards.map(card => card.id)).toEqual(["backend", "devices", "guide", "admin", "visitor", "staff", "screen"]);
    expect(cards.every(card => card.available)).toBe(true);
  });

  it("顶层来源、时间与数组损坏不能当作一次成功快照", () => {
    const sample = createServiceStatusSample();
    expect(isServiceStatusSnapshot(sample)).toBe(true);
    for (const value of [null, {}, { ...sample, source: "unknown" }, { ...sample, checkedAt: "invalid" }, { ...sample, modules: null }]) {
      expect(isServiceStatusSnapshot(value)).toBe(false);
    }
  });
});

describe("固定服务快照适配", () => {
  it("刷新只改变真实读取时间，样例相互隔离", async () => {
    bootContext();
    const first = await getServiceStatus();
    const second = await getServiceStatus();
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error("读取失败");
    expect(second.data.checkedAt).toBe(first.data.checkedAt);
    expect(second.data.modules).toEqual(first.data.modules);
    expect(second.data.sampleReadAt).toBeGreaterThan(first.data.sampleReadAt);
    first.data.modules[0]!.healthyCount = 0;
    expect(second.data.modules[0]!.healthyCount).toBe(7);
  });

  it("仍要求员工会话", async () => {
    bootContext();
    expireSession();
    expect(await getServiceStatus()).toMatchObject({ ok: false, error: { code: "AUTH_REQUIRED" } });
  });
});
