import { describe, it, expect, vi } from "vitest";
import * as domain from "../../packages/domain/src";
import { scenario } from "../../scenario/config";
import {
  C01,
  ROLE,
  referenceInput,
  validateCase,
  sqlRows,
  adaptRows,
  adaptFacilities,
  demoScenario,
  runChecks,
  createWorkflow,
  canExecute,
  invalidate,
  resetGroup,
  directTo,
  currentReport,
  exportReport,
  deliveryReady,
} from "../../packages/demo/src";
import { matches, message, parseDemo } from "../../packages/demo/src/bridge";
describe("校园演示契约与实际检查", () => {
  it("错误与修正只有同一 T1 的设施引用不同，错误阻断适配", () => {
    const bad = referenceInput(true),
      good = referenceInput();
    expect(validateCase(bad)).toEqual({
      valid: false,
      errors: ["T1 的设施引用 F404 不存在"],
    });
    expect(() => sqlRows(bad)).toThrow("F404");
    bad.workOrders[0].facilityId = "F4";
    expect(bad).toEqual(good);
    expect(adaptRows(sqlRows())).toEqual(C01.workOrders);
    expect(adaptFacilities(sqlRows())).toEqual(C01.facilities);
  });
  it("检查缺失字段、重复编号、楼宇引用和无效初始状态", () => {
    const bad = referenceInput();
    bad.facilities.push({ ...bad.facilities[0], buildingId: "B404" });
    bad.workOrders[0].description = "";
    bad.workOrders[0].status = "已完成";
    expect(validateCase(bad).errors.join(" ")).toMatch(
      /重复.*B404.*description.*初始状态/,
    );
  });
  it("十个真实断言全部运行，D02 记录拒绝，不污染现场与原始种子", () => {
    const live = domain.createState(demoScenario(scenario, "campus-ready"));
    const snapshot = JSON.stringify(scenario);
    const report = runChecks(scenario, "unit");
    expect(report.results).toHaveLength(10);
    expect(report.results.every((r) => r.passed)).toBe(true);
    expect(report.results.find((r) => r.id === "D02")?.actual).toMatchObject({
      inputAccepted: false,
    });
    expect(live.records.tasks[0].status).toBe("待处理");
    expect(live.records.tasks[0].result).toBe("");
    expect(JSON.stringify(scenario)).toBe(snapshot);
  });
  it("业务函数真实异常保留为失败，不吞错返回通过", () => {
    const mock = vi.spyOn(domain, "complete").mockImplementation(() => {
      throw new Error("实际检查异常");
    });
    try {
      const report = runChecks(scenario, "failed");
      expect(report.results.find((r) => r.id === "B01")).toMatchObject({
        passed: false,
        error: "实际检查异常",
      });
    } finally {
      mock.mockRestore();
    }
  });
  it("匿名副本覆盖全部可访问集合，普通种子不改；后勤只保留 T1", () => {
    const map = demoScenario(scenario, "campus-map");
    const text = JSON.stringify(map.seed);
    for (const name of ["陈越", ...scenario.seed.people.map((p) => p.title)])
      expect(text).not.toContain(name);
    const staff = demoScenario(scenario, "campus-ready");
    expect(staff.seed.tasks).toHaveLength(1);
    expect(staff.seed.inspections).toHaveLength(0);
    expect(staff.seed.facilities[0].id).toBe("F4");
    expect(demoScenario(scenario, "template").seed.tasks).toHaveLength(0);
    expect(scenario.seed.tasks).toHaveLength(4);
    expect(ROLE).toBe("后勤人员");
  });
});
describe("工作流结果可信度与消息隔离", () => {
  it("失败引用锁定 SQL，修正使所有下游检查失效但保留失败历史", () => {
    const w = createWorkflow("unit");
    w.statuses.reference = "failed";
    w.history.push({
      at: "test",
      node: "reference",
      kind: "validation-rejected",
      detail: "F404",
    });
    expect(canExecute(w, "sql")).toBe(false);
    w.statuses.reference = "passed";
    expect(canExecute(w, "sql")).toBe(true);
    w.reports.push({ valid: true, report: runChecks(scenario, w.run) });
    invalidate(w, ["reference"]);
    expect(currentReport(w)).toBeUndefined();
    expect(w.reports).toHaveLength(1);
    expect(w.history[0].detail).toBe("F404");
    expect(w.statuses.delivery).toBe("stale");
  });
  it("SQL 阶段复位重新从错误引用开始，直达不会生成通过结果", () => {
    const w = createWorkflow("unit");
    w.corrected = true;
    resetGroup(w, "sql");
    expect(w.corrected).toBe(false);
    directTo(w, "test");
    expect(w.statuses.frontend).toBe("preloaded");
    expect(currentReport(w)).toBeUndefined();
    expect(exportReport(w).automaticPassed).toBe(false);
    expect(deliveryReady(w)).toBe(false);
    expect(canExecute(w, "test-requirement")).toBe(true);
  });
  it("拒绝非法阶段、错误轮次、素材版本与消息协议", () => {
    const context = { run: "unit", stage: "campus-ready" as const };
    const ready = message("ready", context, "request");
    expect(matches(ready, context)).toBe(true);
    for (const change of [
      { run: "old" },
      { stage: "template" },
      { version: "old" },
      { caseId: "other" },
      { protocol: "other" },
    ])
      expect(matches({ ...ready, ...change }, context)).toBe(false);
    expect(
      parseDemo("?demo=1&stage=finished&run=x", "staff").error,
    ).toBeTruthy();
    expect(
      parseDemo("?demo=1&stage=campus-ready&run=x", "public").error,
    ).toBeTruthy();
    expect(parseDemo("", "staff").enabled).toBe(false);
  });
});
