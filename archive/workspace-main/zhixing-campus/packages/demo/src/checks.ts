import { claim, complete, metrics, type Scenario } from "@scene/domain";
import {
  C01,
  ROLE,
  VERSION,
  CASE_ID,
  caseState,
  referenceInput,
  sqlRows,
  adaptRows,
  adaptFacilities,
  F03,
} from "./data";
import { validateCase } from "./validation";
export interface CheckResult {
  id: string;
  category: string;
  expected: string;
  actual: unknown;
  passed: boolean;
  error?: string;
  executedAt: string;
  durationMs: number;
}
export interface CheckReport {
  caseId: string;
  version: string;
  run: string;
  executedAt: string;
  results: CheckResult[];
}
export const checkDefinitions = [
  ["D01", "数据", "必要字段完整、编号唯一、初始状态合法"],
  ["D02", "数据", "F404 被拒绝，错误指向 T1；拒绝断言通过"],
  ["D03", "数据", "T1 → F4 → B1 引用通过"],
  ["D04", "数据", "SQL 配套结果与适配字段和 C01 一致"],
  ["D05", "数据", "筛选包含 F4，工单设施与楼宇可解析"],
  ["B01", "业务", "直接完成被拒绝：请先领取任务，状态不变"],
  ["B02", "业务", "领取后处理中，处理人为后勤人员"],
  ["B03", "业务", "空白处理结果被拒绝，保持处理中"],
  ["B04", "业务", "保存处理结果，待办由 1 变为 0"],
  ["B05", "隔离", "再次创建仍为待处理，C01 未被修改"],
] as const;
export function runChecks(base: Scenario, run: string): CheckReport {
  const snapshot = JSON.stringify(C01);
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const actions: Record<string, () => unknown> = {
    D01: () => {
      const r = validateCase(C01);
      assert(r.valid, r.errors.join("；"));
      return r;
    },
    D02: () => {
      const r = validateCase(referenceInput(true));
      assert(
        !r.valid &&
          r.errors.some((e) => e.includes("T1") && e.includes("F404")),
        "F404 没有被正确拦截",
      );
      return {
        inputAccepted: r.valid,
        errors: r.errors,
        assertion: "预期拦截有效",
      };
    },
    D03: () => {
      const r = validateCase(referenceInput());
      assert(r.valid, r.errors.join("；"));
      return r;
    },
    D04: () => {
      const rows = sqlRows();
      const adapted = adaptRows(rows);
      const facilities = adaptFacilities(rows);
      assert(
        JSON.stringify(facilities) === JSON.stringify(C01.facilities),
        "设施与楼宇适配不一致",
      );
      assert(
        JSON.stringify(adapted) ===
          JSON.stringify(
            C01.workOrders.map((t) => ({
              id: t.id,
              facilityId: t.facilityId,
              title: t.title,
              location: t.location,
              status: t.status,
              description: t.description,
              owner: t.owner,
              result: t.result,
              category: t.category,
              date: t.date,
            })),
          ),
        "适配字段与 C01 不一致",
      );
      assert(
        rows[0].building_id === C01.buildings[0].id &&
          rows[0].facility_name === C01.facilities[0].title,
        "关联字段不一致",
      );
      return { rows, adapted, facilities };
    },
    D05: () => {
      const t = adaptRows(sqlRows())[0];
      const f = F03.facilities.find((f) => f.id === t.facilityId);
      assert(
        f && C01.buildings.some((b) => b.id === f.buildingId),
        "设施筛选或关联缺失",
      );
      return { facilityId: f?.id, buildingId: f?.buildingId };
    },
    B01: () => {
      const t = caseState(base).records.tasks[0];
      const error = complete(t, C01.completionResult);
      assert(
        error === "请先领取任务" && t.status === "待处理",
        "未领取任务被错误完成",
      );
      return { error, status: t.status };
    },
    B02: () => {
      const t = caseState(base).records.tasks[0];
      claim(t, ROLE);
      assert(t.status === "处理中" && t.owner === ROLE, "领取结果不正确");
      return t;
    },
    B03: () => {
      const t = caseState(base).records.tasks[0];
      claim(t, ROLE);
      const error = complete(t, "  ");
      assert(
        error === "请填写处理结果" && t.status === "处理中",
        "空结果未被正确拦截",
      );
      return { error, status: t.status };
    },
    B04: () => {
      const s = caseState(base);
      const before = Number(metrics(s, base)[2].value);
      const t = s.records.tasks[0];
      claim(t, ROLE);
      const error = complete(t, C01.completionResult);
      const after = Number(metrics(s, base)[2].value);
      assert(
        !error &&
          t.status === "已完成" &&
          t.result === C01.completionResult &&
          before - after === 1,
        "完成结果或待办变化不正确",
      );
      return { before, after, task: t };
    },
    B05: () => {
      const first = caseState(base);
      claim(first.records.tasks[0], ROLE);
      complete(first.records.tasks[0], C01.completionResult);
      const next = caseState(base);
      assert(
        next.records.tasks[0].status === "待处理" &&
          !next.records.tasks[0].result &&
          JSON.stringify(C01) === snapshot,
        "检查污染了种子或其他副本",
      );
      return {
        status: next.records.tasks[0].status,
        result: next.records.tasks[0].result,
        sourceUnchanged: JSON.stringify(C01) === snapshot,
      };
    },
  };
  return {
    caseId: CASE_ID,
    version: VERSION,
    run,
    executedAt: new Date().toISOString(),
    results: checkDefinitions.map(([id, category, expected]) => {
      const started = performance.now();
      const executedAt = new Date().toISOString();
      try {
        return {
          id,
          category,
          expected,
          actual: actions[id](),
          passed: true,
          executedAt,
          durationMs: performance.now() - started,
        };
      } catch (e) {
        return {
          id,
          category,
          expected,
          actual: null,
          passed: false,
          error: e instanceof Error ? e.message : String(e),
          executedAt,
          durationMs: performance.now() - started,
        };
      }
    }),
  };
}
