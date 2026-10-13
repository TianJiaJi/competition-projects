import { createId } from "../../src/core/id";
import { describe, it, expect } from "vitest";
import { createGateService, type StoragePort } from "../fixtures/gate";
import { BUSINESS_KEY, SESSION_KEY, seed } from "../fixtures/seed";
import {
  clone,
  filterTasks,
  type Command,
  type Database,
} from "../../src/core/types";
import { validDatabase } from "../../src/core/validation";
class Memory implements StoragePort {
  map = new Map<string, string>();
  fail = false;
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.fail) throw Error("quota");
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
let n = 0;
const command = (v: number): Command => ({
  key: `command-${++n}`,
  expectedVersion: v,
});
async function setup(demoEnabled = true) {
  const business = new Memory(),
    session = new Memory();
  const service = createGateService({
    business,
    session,
    demoEnabled,
    now: () => "2026-09-13T14:35:00+08:00",
    id: () => `oa-${++n}`,
  });
  await service.login("chen_demo", "GateDemo123!");
  await service.load();
  return { business, session, service };
}
const input = {
  type: "reinforcement" as const,
  reason: "现场人手不足",
  needs: "两名安保",
};
describe("前线服务业务边界", () => {
  it("LAN HTTP 不依赖 randomUUID，提交 ID 保持 UUID 格式且不重复", () => {
    const values = Array.from({ length: 10 }, () => createId());
    expect(new Set(values).size).toBe(10);
    values.forEach((value) =>
      expect(value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    );
  });
  it("领取、多个 OA、审批/撤回后结案，保持监测值", async () => {
    const { service } = await setup();
    let db = await service.start("task-1", command(1));
    db = await service.createOA("task-1", input, command(2));
    const first = db.requests.at(-1)!;
    db = await service.createOA(
      "task-1",
      { ...input, type: "cordon" },
      command(3),
    );
    const second = db.requests.at(-1)!;
    await expect(
      service.complete("task-1", "已疏导", command(4)),
    ).rejects.toMatchObject({ code: "OA_PENDING" });
    db = await service.decideDemo(first.id, "approved", "已批准", command(1));
    await expect(
      service.complete("task-1", "已疏导", command(5)),
    ).rejects.toMatchObject({ code: "OA_PENDING" });
    db = await service.withdraw(second.id, command(1));
    db = await service.complete("task-1", "已完成现场疏导", command(6));
    const task = db.tasks[0];
    expect(task.status).toBe("resolved");
    expect(task.metric).toBe("区域承载率 92%");
    expect(task.records.at(-1)?.actor).toBe("陈越");
    expect(task.completedAt).toBeTruthy();
    expect(validDatabase(db)).toBe(true);
  });
  it("幂等重复不重复记录，不允许同键变更请求", async () => {
    const { service } = await setup();
    const cmd = command(1);
    const first = await service.start("task-1", cmd);
    expect(await service.start("task-1", cmd)).toEqual(first);
    await expect(service.start("task-3", cmd)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    const oaCmd = command(2);
    const db = await service.createOA("task-1", input, oaCmd);
    expect(await service.createOA("task-1", input, oaCmd)).toEqual(db);
  });
  it("其他员工不能完成、申请或撤回，不可再次领取", async () => {
    const { service } = await setup();
    await service.start("task-1", command(1));
    const db = await service.createOA("task-1", input, command(2));
    const id = db.requests.at(-1)!.id;
    await service.login("li_demo", "GateDemo123!");
    await expect(
      service.complete("task-1", "处理好了", command(3)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.createOA("task-1", input, command(3)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.withdraw(id, command(1))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(service.start("task-1", command(3))).rejects.toMatchObject({
      code: "TASK_STATE_CONFLICT",
    });
  });
  it("审批只在启用演示的适配器提供，必须填意见，不重复审批", async () => {
    const { service } = await setup();
    await service.start("task-1", command(1));
    const db = await service.createOA("task-1", input, command(2));
    const id = db.requests.at(-1)!.id;
    await expect(
      service.decideDemo(id, "approved", " ", command(1)),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await service.decideDemo(id, "rejected", "补充人数后重新申请", command(1));
    await expect(
      service.decideDemo(id, "approved", "同意", command(2)),
    ).rejects.toMatchObject({ code: "OA_STATE_CONFLICT" });
    await expect(service.withdraw(id, command(2))).rejects.toMatchObject({
      code: "OA_STATE_CONFLICT",
    });
    const prod = await setup(false);
    await prod.service.start("task-1", command(1));
    const p = await prod.service.createOA("task-1", input, command(2));
    await expect(
      prod.service.decideDemo(
        p.requests.at(-1)!.id,
        "approved",
        "同意",
        command(1),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("拒绝旧版本和越级结案，完成后不能申请", async () => {
    const { service } = await setup();
    await expect(
      service.complete("task-1", "完成", command(1)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await service.start("task-1", command(1));
    await expect(
      service.createOA("task-1", input, command(1)),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await service.complete("task-1", "完成", command(2));
    await expect(
      service.createOA("task-1", input, command(3)),
    ).rejects.toMatchObject({ code: "TASK_STATE_CONFLICT" });
  });
  it("必填、500 字限制及类别校验不产生半条记录", async () => {
    const { service } = await setup();
    await service.start("task-1", command(1));
    const before = await service.load();
    for (const data of [
      { ...input, reason: " " },
      { ...input, needs: "字".repeat(501) },
      { ...input, type: "fake" as never },
    ])
      await expect(
        service.createOA("task-1", data, command(2)),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      service.complete("task-1", " ", command(2)),
    ).rejects.toMatchObject({ fieldErrors: { result: "请填写 1—500 字。" } });
    expect(await service.load()).toEqual(before);
  });
  it("存储失败保持旧状态，同一提交重试成功一次", async () => {
    const { service, business } = await setup();
    const before = business.getItem(BUSINESS_KEY);
    const cmd = command(1);
    business.fail = true;
    await expect(service.start("task-1", cmd)).rejects.toMatchObject({
      code: "MOCK_STORAGE_FAILED",
    });
    expect(business.getItem(BUSINESS_KEY)).toBe(before);
    business.fail = false;
    const db = await service.start("task-1", cmd);
    expect(db.tasks[0].records).toHaveLength(2);
  });
  it("跨标签旧快照、删除和同 revision 替换均拒绝覆盖", async () => {
    const { service, business } = await setup();
    const other = createGateService({ business, session: new Memory() });
    await other.login("li_demo", "GateDemo123!");
    await other.load();
    await other.start("task-1", command(1));
    await expect(service.start("task-3", command(1))).rejects.toMatchObject({
      code: "MOCK_STORAGE_CONFLICT",
    });
    await expect(service.reset()).rejects.toMatchObject({
      code: "MOCK_STORAGE_CONFLICT",
    });
    await service.load();
    business.removeItem(BUSINESS_KEY);
    await expect(service.reset()).rejects.toMatchObject({
      code: "MOCK_STORAGE_CONFLICT",
    });
    await service.load();
    const raw = JSON.parse(business.getItem(BUSINESS_KEY)!) as Database;
    raw.tasks[0].reason = "另一标签变更";
    business.setItem(BUSINESS_KEY, JSON.stringify(raw));
    await expect(service.start("task-1", command(1))).rejects.toMatchObject({
      code: "MOCK_STORAGE_CONFLICT",
    });
  });
  it("损坏数据提示可恢复，重置保留会话及其他端数据", async () => {
    const { service, business, session } = await setup();
    business.setItem("other-app", "keep");
    business.setItem(BUSINESS_KEY, '{"schemaVersion":1}');
    await expect(service.load()).rejects.toMatchObject({
      code: "MOCK_STORAGE_CORRUPT",
    });
    const before = session.getItem(SESSION_KEY);
    await service.reset();
    expect(session.getItem(SESSION_KEY)).toBe(before);
    expect(business.getItem("other-app")).toBe("keep");
    expect(validDatabase(await service.load())).toBe(true);
  });
  it("数据刷新恢复、会话到期/退出后拒绝业务调用，不存密码", async () => {
    const { service, business, session } = await setup();
    await service.start("task-1", command(1));
    const another = createGateService({ business, session });
    expect((await another.load()).tasks[0].assignee?.id).toBe("staff-chen");
    expect(session.getItem(SESSION_KEY)).not.toContain("GateDemo");
    const s = JSON.parse(session.getItem(SESSION_KEY)!);
    s.expiresAt = Date.now() - 1;
    session.setItem(SESSION_KEY, JSON.stringify(s));
    await expect(another.load()).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
    await service.login("chen_demo", "GateDemo123!");
    await service.logout();
    await expect(service.start("task-3", command(1))).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });
  it("同适配器并发领取只成功一次", async () => {
    const { service } = await setup();
    const result = await Promise.allSettled([
      service.start("task-1", command(1)),
      service.start("task-1", command(1)),
    ]);
    expect(result.map((x) => x.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
  });
  it("嵌套字段损坏与未知运行被拒绝", async () => {
    const base = seed();
    for (const mutate of [
      (d: Database) => {
        d.tasks[0].records[0].at = "bad";
      },
      (d: Database) => {
        d.requests[0].decision!.actor.name = "";
      },
      (d: Database) => {
        d.requests[0].taskId = "missing";
      },
      (d: Database) => {
        d.tasks[1].assignee = null;
      },
    ]) {
      const value = clone(base);
      mutate(value);
      expect(validDatabase(value)).toBe(false);
    }
    const { business, service } = await setup();
    const value = seed();
    value.runId = "old";
    value.tasks.forEach((t) => (t.runId = "old"));
    value.requests.forEach((o) => (o.runId = "old"));
    business.setItem(BUSINESS_KEY, JSON.stringify(value));
    await expect(service.load()).rejects.toMatchObject({ code: "RUN_EXPIRED" });
  });
  it("历史日期按上海完成日筛选，空结果不改变数据", () => {
    const db = seed("2026-09-13T14:00:00+08:00");
    db.tasks.at(-1)!.completedAt = "2026-09-12T17:00:00Z";
    const filter = {
      scope: "history" as const,
      actorId: "staff-chen",
      keyword: "",
      status: "",
      category: "",
      from: "2026-09-13",
      to: "2026-09-13",
    };
    expect(filterTasks(db.tasks, filter)).toHaveLength(1);
    expect(
      filterTasks(db.tasks, { ...filter, keyword: "不存在" }),
    ).toHaveLength(0);
  });
});
