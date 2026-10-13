import { beforeEach, describe, expect, it } from "vitest";
import { bootContext } from "./helpers";
import { getFacility, listFacilities, saveRestroomAdjustment, updateFacilityState } from "../../src/services/facilities";
import { detectRestroomDataIssue } from "../../src/core/restroom";

describe("设施运行、卫生间与返程通路（§4.2、§4.3）", () => {
  beforeEach(() => {
    bootContext();
  });

  it("AC-14：女厕 N24/O20 申请 10 → 实际 4、等待 6、可用 0，O 不变", async () => {
    const detail = await getFacility("t1");
    expect(detail.ok).toBe(true);
    const female = detail.ok ? detail.data.restroom?.parts.find((part) => part.key === "female") : undefined;
    expect(female?.total).toBe(24);
    expect(female?.occupied).toBe(20);

    const saved = await saveRestroomAdjustment("t1", {
      state: "open",
      requested: { female: 10, male: 0, maleUrinals: 0, accessible: 0 },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const part = saved.data.restroom!.parts.find((item) => item.key === "female")!;
    expect(part.effectivePaused).toBe(4);
    expect(part.pendingRelease).toBe(6);
    expect(part.available).toBe(0);
    expect(part.occupied).toBe(20);
  });

  it("AC-14：申请 25、负数与小数被拒绝；整座维护时 S=N-O、W=O、A=0", async () => {
    const tooMany = await saveRestroomAdjustment("t1", {
      state: "open",
      requested: { female: 25, male: 0, maleUrinals: 0, accessible: 0 },
    });
    expect(tooMany.ok).toBe(false);

    const negative = await saveRestroomAdjustment("t1", {
      state: "open",
      requested: { female: -1, male: 0, maleUrinals: 0, accessible: 0 },
    });
    expect(negative.ok).toBe(false);

    const fractional = await saveRestroomAdjustment("t1", {
      state: "open",
      requested: { female: 2.5, male: 0, maleUrinals: 0, accessible: 0 },
    });
    expect(fractional.ok).toBe(false);

    // t4 女厕 O=12：维护状态下实际暂停 12、等待释放 12、可用 0（与释放前后快照一致）
    const maintenance = await saveRestroomAdjustment("t4", {
      state: "maintenance",
      reason: "整座维护",
      requested: { female: 0, male: 0, maleUrinals: 0, accessible: 0 },
    });
    expect(maintenance.ok).toBe(true);
    if (!maintenance.ok) return;
    const part = maintenance.data.restroom!.parts.find((item) => item.key === "female")!;
    expect(part.effectivePaused).toBe(12);
    expect(part.pendingRelease).toBe(12);
    expect(part.available).toBe(0);
    expect(part.total).toBe(part.occupied + part.effectivePaused + part.available);
  });

  it("AC-15：有排队时不出现可用空位，人工申请不会伪造空位", async () => {
    const detail = await getFacility("t3");
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    const before = detail.data.restroom!;
    const queued = before.parts.find((part) => part.queue > 0);
    expect(queued).toBeTruthy();
    expect(queued!.available).toBe(0);
    expect(queued!.occupied + queued!.baselinePaused).toBe(queued!.total);

    const saved = await saveRestroomAdjustment("t3", {
      state: "open",
      requested: { female: 0, male: 0, maleUrinals: 0, accessible: 0 },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const after = saved.data.restroom!.parts.find((part) => part.key === queued!.key)!;
    expect(after.queue).toBe(queued!.queue);
    expect(after.available).toBe(0);
  });

  it("样例数据违反排队保护时禁止分项保存", () => {
    const issue = detectRestroomDataIssue(
      { female: 24, male: 8, maleUrinals: 12, accessible: 2 },
      {
        female: { occupied: 20, queue: 3, baselinePaused: 0 },
        male: { occupied: 0, queue: 0, baselinePaused: 0 },
        maleUrinals: { occupied: 0, queue: 0, baselinePaused: 0 },
        accessible: { occupied: 0, queue: 0, baselinePaused: 0 },
      },
    );
    expect(issue).toContain("排队");
  });

  it("AC-13：关闭可替代路允许，关闭必要支路被拒并列出受影响位置", async () => {
    const alternative = await updateFacilityState("road-17", { state: "closed", reason: "路面修补" });
    expect(alternative.ok).toBe(true);

    const blocked = await updateFacilityState("road-8", { state: "closed", reason: "支路封闭" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe("RETURN_PATH_BLOCKED");
      expect(blocked.error.details?.join(" ")).toContain("听溪台");
    }

    const state = await listFacilities({ keyword: "听溪台" });
    expect(state.ok && state.data[0].state).toBe("open");
  });

  it("停用 gate-out 始终被拒绝；道路不接受“维护”状态；unknown 只读", async () => {
    const exit = await updateFacilityState("gate-out", { state: "closed", reason: "临时封闭出口" });
    expect(exit.ok).toBe(false);
    if (!exit.ok) expect(exit.error.code).toBe("RETURN_PATH_BLOCKED");

    const road = await updateFacilityState("road-0", { state: "maintenance", reason: "例行养护" });
    expect(road.ok).toBe(false);

    const unknown = await updateFacilityState("creek", { state: "unknown" });
    expect(unknown.ok).toBe(false);
  });

  it("AC-12：索道整线同步，排队与在途不清零，没有单站入口", async () => {
    const before = await getFacility("cable-main");
    expect(before.ok && before.data.facility.metrics.some((metric) => metric.label === "在途人数" && metric.value === "24 人")).toBe(true);

    const closed = await updateFacilityState("cable-main", { state: "maintenance", reason: "设备例行检查" });
    expect(closed.ok).toBe(true);
    const after = await getFacility("cable-main");
    expect(after.ok && after.data.facility.state).toBe("maintenance");
    expect(after.ok && after.data.facility.metrics.some((metric) => metric.label === "在途人数" && metric.value === "24 人")).toBe(true);

    const upper = await listFacilities({ category: "cable" });
    expect(upper.ok && upper.data.length).toBe(1);
  });

  it("设施列表覆盖九类并尊重内容覆盖名称", async () => {
    const list = await listFacilities();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const categories = new Set(list.data.map((facility) => facility.category));
    for (const category of ["attraction", "road", "parking", "toilet", "cable", "safety", "commercial", "terminal", "entrance"]) {
      expect(categories.has(category as never)).toBe(true);
    }
    const { savePoiContent } = await import("../../src/services/content");
    const saved = await savePoiContent("creek", {
      name: "听溪台（后台覆盖名）",
      summary: "临溪木台，可近看溪谷与岸边植被。",
      body: "## 听溪台\n\n演示正文。",
      imageUrls: [],
      sourceIds: ["source-02"],
    });
    expect(saved.ok).toBe(true);
    const after = await listFacilities({ keyword: "后台覆盖名" });
    expect(after.ok && after.data.length).toBe(1);
  });
});
