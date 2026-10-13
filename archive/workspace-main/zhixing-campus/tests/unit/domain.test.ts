import { describe, it, expect } from "vitest";
import { scenario } from "../../scenario/config";
import {
  createState,
  metrics,
  claim,
  complete,
  createRecord,
  validateRecord,
  answerQuestion,
} from "../../packages/domain/src";
describe("独立演示数据", () => {
  it("修改当前端不会影响种子和另一个端，刷新重建样例", () => {
    const a = createState(scenario),
      b = createState(scenario);
    a.records.tasks[0].title = "本次修改";
    expect(b.records.tasks[0].title).toBe(scenario.seed.tasks[0].title);
    expect(createState(scenario).records.tasks[0].title).not.toBe("本次修改");
  });
  it("领取与完成工单需要处理结果，并反映在指标中", () => {
    const state = createState(scenario),
      task = state.records.tasks[0];
    const before = Number(metrics(state, scenario)[2].value);
    expect(complete(task, "修复")).toBe("请先领取任务");
    claim(task, "陈越");
    expect(complete(task, "  ")).toBe("请填写处理结果");
    expect(complete(task, "已更换灯具")).toBe("");
    expect(metrics(state, scenario)[2].value).toBe(String(before - 1));
    expect(task.result).toBe("已更换灯具");
  });
  it("新增记录ID唯一且不会重置已有内容", () => {
    const state = createState(scenario),
      input = { ...state.records.tasks[0] };
    const a = createRecord(state, "tasks", input),
      b = createRecord(state, "tasks", input);
    expect(a.id).not.toBe(b.id);
    expect(state.records.tasks).toHaveLength(scenario.seed.tasks.length + 2);
  });
  it("校验必填和手机号", () => {
    expect(validateRecord("", "位置", "说明")).toBeTruthy();
    expect(validateRecord("名称", "位置", "说明", "123")).toContain("手机");
    expect(validateRecord("名称", "位置", "说明", "13800001000")).toBe("");
  });
  it("未匹配的问题返回明确的服务引导，停车回答使用当前数据", () => {
    const state = createState(scenario);
    expect(answerQuestion("未知", scenario, state)).toContain("常见问题");
    if (scenario.kind === "community") {
      state.records.parking[0].used = 0;
      const count = state.records.parking.reduce(
        (s, r) => s + (r.capacity ?? 0) - (r.used ?? 0),
        0,
      );
      expect(answerQuestion("停车", scenario, state)).toContain(String(count));
    }
  });
  it("设施、楼宇和停车的使用数量没有超过容量", () => {
    for (const items of [
      scenario.seed.facilities,
      scenario.seed.buildings,
      scenario.seed.parking,
    ])
      for (const row of items)
        if (row.capacity !== undefined)
          expect(row.used ?? 0).toBeLessThanOrEqual(row.capacity);
  });
});
