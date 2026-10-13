import { describe, it, expect } from "vitest";
import { testStore } from "../helpers/postgres";
import {
  bookingSlots,
  saveSchedule,
} from "../../apps/server/src/platform/schedules";
describe("自定义预约日程", () => {
  it("精确分钟、范围保存、占用保护与事务回滚", async () => {
    const f = await testStore();
    try {
      const id = (await f.store.get<any>("settings", "selected")).id,
        time = Date.parse("2026-09-14T08:00:00+08:00");
      const input = {
        from: "2026-09-14",
        to: "2026-09-15",
        kind: "entry",
        slots: [{ start: "08:15", end: "09:45", capacity: 5 }],
      };
      await f.store.transaction(() => saveSchedule(f.store, id, time, input));
      expect(
        (await bookingSlots(f.store, id, time, "2026-09-15", "entry"))[0],
      ).toMatchObject({ slot: "08:15", end: "09:45", capacity: 5 });
      await f.store.put(
        "orders",
        "booked",
        {
          id: "booked",
          date: "2026-09-15",
          kind: "entry",
          slot: "08:15",
          people: 3,
          status: "confirmed",
        },
        id,
      );
      await expect(
        f.store.transaction(() =>
          saveSchedule(f.store, id, time, {
            ...input,
            slots: [{ start: "08:15", end: "09:45", capacity: 2 }],
          }),
        ),
      ).rejects.toThrow("已有 3");
      expect(
        (await bookingSlots(f.store, id, time, "2026-09-14", "entry"))[0]
          .capacity,
      ).toBe(5);
      await expect(
        f.store.transaction(() =>
          saveSchedule(f.store, id, time, {
            ...input,
            slots: [
              { start: "08:00", end: "10:00", capacity: 5 },
              { start: "09:00", end: "11:00", capacity: 5 },
            ],
          }),
        ),
      ).rejects.toThrow("重叠");
    } finally {
      await f.close();
    }
  });
});

describe("账号与员工资料", () => {
  it("创建临时密码、首次改密、绑定区域及归档保留历史", async () => {
    const f = await testStore();
    try {
      const { peopleWrite, people } =
        await import("../../apps/server/src/platform/people");
      const admin = (await f.store.login("admin01", "123456")).user;
      const created: any = await f.store.transaction(() =>
        peopleWrite(f.store, admin, "", "/admin/people", {
          username: "repair_new",
          name: "维修新员工",
          role: "staff",
          tradeIds: ["repair"],
          regionIds: ["Z1", "Z2"],
        }),
      );
      const auth = await f.store.login("repair_new", created.temporaryPassword);
      expect(auth.user.mustChangePassword).toBe(true);
      const changed = await f.store.changePassword(auth.user, "newPassword123");
      expect(changed.user.mustChangePassword).toBe(false);
      expect(await f.store.authenticate(auth.token)).toBeUndefined();
      const person = (await people(f.store)).find((p) => p.id === created.id)!;
      expect(person.regionIds).toEqual(["Z1", "Z2"]);
      await f.store.transaction(() =>
        peopleWrite(
          f.store,
          admin,
          "",
          "/admin/people/" + created.id + "/archive",
          { expectedVersion: person.version },
        ),
      );
      expect(await f.store.authenticate(changed.token)).toBeUndefined();
      expect(
        (await people(f.store)).find((p) => p.id === created.id)?.archived,
      ).toBe(true);
    } finally {
      await f.close();
    }
  });
});

describe("聊天室管控", () => {
  it("全局与房间关闭、乐观锁、批量撤回恢复与禁言", async () => {
    const f = await testStore();
    try {
      const { chatControlWrite, assertRoomOpen } =
        await import("../../apps/server/src/platform/chat-control");
      const admin = (await f.store.login("admin01", "123456")).user;
      const id = (await f.store.get<any>("settings", "selected")).id;
      const write = (path: string, input: any) =>
        f.store.transaction(() =>
          chatControlWrite(
            f.store,
            admin,
            id,
            "/admin/chat-control/" + path,
            input,
          ),
        );
      await write("rooms", {
        id: "lobby",
        closed: true,
        expectedVersion: 0,
        reason: "维护",
      });
      await expect(assertRoomOpen(f.store, id, "lobby")).rejects.toThrow(
        "关闭",
      );
      await assertRoomOpen(f.store, id, "routes");
      await expect(
        write("rooms", { id: "lobby", closed: false, expectedVersion: 0 }),
      ).rejects.toThrow("变化");
      await write("rooms", { id: "lobby", closed: false, expectedVersion: 1 });
      await assertRoomOpen(f.store, id, "lobby");
      await write("rooms", {
        id: "global",
        closed: true,
        expectedVersion: 0,
        reason: "全局维护",
      });
      await expect(assertRoomOpen(f.store, id, "routes")).rejects.toThrow(
        "关闭",
      );
      await f.store.put(
        "messages",
        "m1",
        {
          id: "m1",
          authorId: "visitor01",
          version: 1,
          removed: false,
          text: "hello",
        },
        id,
      );
      await write("messages", {
        items: [{ id: "m1", version: 1 }],
        action: "remove",
        reason: "审核",
      });
      expect((await f.store.get<any>("messages", "m1", id)).removed).toBe(true);
      await write("messages", {
        items: [{ id: "m1", version: 2 }],
        action: "restore",
        reason: "误判恢复",
      });
      expect((await f.store.get<any>("messages", "m1", id)).removed).toBe(
        false,
      );
      await write("messages", {
        items: [{ id: "m1", version: 3 }],
        action: "mute",
        reason: "持续违规",
        minutes: 60,
      });
      expect(
        (await f.store.get<any>("mutes", "visitor01", id)).until,
      ).toBeGreaterThan(Date.now());
    } finally {
      await f.close();
    }
  });
});

describe("知识库发布", () => {
  it("迁移幂等、草稿隔离、停用与版本来源", async () => {
    const f = await testStore();
    try {
      const {
        migrateKnowledge,
        knowledgeWrite,
        publishedKnowledge,
        knowledgeSource,
      } = await import("../../apps/server/src/platform/knowledge-library");
      const admin = (await f.store.login("admin01", "123456")).user;
      await migrateKnowledge(f.store);
      const count = (await publishedKnowledge(f.store)).length;
      await migrateKnowledge(f.store);
      expect((await publishedKnowledge(f.store)).length).toBe(count);
      const write = (path: string, input: any) =>
        f.store.transaction(() => knowledgeWrite(f.store, admin, path, input));
      const draft: any = await write("/admin/knowledge", {
        title: "新路线提示",
        body: "测试发布内容",
        published: false,
      });
      expect(
        (await publishedKnowledge(f.store)).some((r) => r.id === draft.id),
      ).toBe(false);
      const published: any = await write("/admin/knowledge/" + draft.id, {
        ...draft,
        expectedVersion: 1,
        published: true,
      });
      const source = knowledgeSource(published);
      await write("/admin/knowledge/" + draft.id, {
        ...published,
        expectedVersion: 2,
        body: "尚未发布的修改",
        published: false,
      });
      expect(
        (await publishedKnowledge(f.store)).find((r) => r.id === draft.id).body,
      ).toBe("测试发布内容");
      await write("/admin/knowledge/" + draft.id, {
        expectedVersion: 3,
        action: "disable",
      });
      expect(
        (await publishedKnowledge(f.store)).some((r) => r.id === draft.id),
      ).toBe(false);
      expect(
        (await f.store.get<any>("knowledge-sources", source.id)).excerpt,
      ).toBe("测试发布内容");
    } finally {
      await f.close();
    }
  });
});

describe("维修工单闭环", () => {
  it("派单接单、挂起资源、驳回验收与单独恢复开放", async () => {
    const f = await testStore();
    try {
      const { workflowWrite } =
        await import("../../apps/server/src/platform/workflows");
      const admin = (await f.store.login("admin01", "123456")).user,
        staff = (await f.store.login("staff01", "123456")).user,
        id = (await f.store.get<any>("settings", "selected")).id;
      let closed = false;
      const write = (u: any, path: string, input: any) =>
        f.store.transaction(() =>
          workflowWrite(
            f.store,
            u,
            id,
            "2026-09-14T09:00:00+08:00",
            path,
            input,
            async () => {
              closed = true;
            },
          ),
        );
      const request: any = await write(staff, "/facility-requests", {
        facilityId: "creek",
        kind: "closure",
        reason: "步道护栏损坏",
      });
      const approved: any = await write(
        admin,
        "/facility-requests/" + request.id + "/approve",
        { expectedVersion: 1, reason: "核实通过", createWorkOrder: true },
      );
      expect(closed).toBe(true);
      let w: any = await f.store.get("work-orders", approved.workOrderId, id);
      const action = async (u: any, a: string, extra: any = {}) => {
        w = await write(u, "/work-orders/" + w.id + "/" + a, {
          expectedVersion: w.version,
          reason: "处理说明",
          ...extra,
        });
      };
      await expect(action(staff, "start")).rejects.toThrow();
      await action(admin, "dispatch", { assigneeId: staff.id });
      await action(staff, "accept");
      await action(staff, "start");
      await action(staff, "block");
      expect(w.status).toBe("suspended");
      await action(admin, "resources");
      await action(admin, "resume");
      await action(staff, "submit");
      expect(w.status).toBe("awaiting_acceptance");
      await expect(action(staff, "approve")).rejects.toThrow();
      await action(admin, "reject");
      expect(w.status).toBe("in_progress");
      await action(staff, "submit");
      await action(admin, "approve");
      expect(w.status).toBe("completed");
      expect(closed).toBe(true);
      expect(
        (await f.store.list<any>("notifications", id)).some(
          (n) => n.userId === staff.id,
        ),
      ).toBe(true);
    } finally {
      await f.close();
    }
  });
});

describe("演示账号活动", () => {
  it("按账号生成且重复请求不重复创建", async () => {
    const f = await testStore();
    try {
      const { seedDemoActivity } =
        await import("../../apps/server/src/platform/demo-activity");
      const { personActivity } =
        await import("../../apps/server/src/platform/people");
      const id = (await f.store.get<any>("settings", "selected")).id;
      await f.store.transaction(() =>
        seedDemoActivity(f.store, id, Date.parse("2026-09-14T09:00:00+08:00")),
      );
      const before = await personActivity(f.store, "visitor01", id);
      expect(before.some((a) => a.type === "AI问答")).toBe(true);
      expect(before.some((a) => a.type === "聊天室发言")).toBe(true);
      await f.store.transaction(() =>
        seedDemoActivity(f.store, id, Date.parse("2026-09-14T09:00:00+08:00")),
      );
      expect((await personActivity(f.store, "visitor01", id)).length).toBe(
        before.length,
      );
    } finally {
      await f.close();
    }
  });
});

describe("检修计划", () => {
  it("安全设施可保存、到期告警不重复且验收后更新周期", async () => {
    const f = await testStore();
    try {
      const { createPlatform } =
        await import("../../apps/server/src/platform/service");
      const p = createPlatform(f.store),
        admin = (await f.store.login("admin01", "123456")).user,
        staff = (await f.store.login("staff01", "123456")).user,
        id = await p.selected();
      const facility = p.scenic.points.find((p) => p.kind === "safety")!;
      const plan: any = await p.write(
        admin,
        id,
        "inspection-create",
        "/admin/inspections",
        {
          facilityId: facility.id,
          intervalDays: 7,
          nextDueDate: "2026-09-14",
          instructions: "检查安全设施",
          enabled: true,
        },
      );
      let schedule = await f.store.get<any>("inspection-schedule", plan.id, id);
      expect(schedule.alertId).toBeTruthy();
      expect(
        (await f.store.list<any>("tasks", id)).filter(
          (t) => t.anchorId === facility.id && t.category === "inspection",
        ),
      ).toHaveLength(1);
      let w = await f.store.get<any>(
        "work-orders",
        "legacy-" + schedule.alertId,
        id,
      );
      for (const [actor, action] of [
        [admin, "dispatch"],
        [staff, "accept"],
        [staff, "start"],
        [staff, "submit"],
        [admin, "approve"],
      ] as const)
        w = await p.write(
          actor,
          id,
          crypto.randomUUID(),
          "/work-orders/" + w.id + "/" + action,
          {
            expectedVersion: w.version,
            assigneeId: staff.id,
            reason: "现场检查通过",
          },
        );
      schedule = await f.store.get<any>("inspection-schedule", plan.id, id);
      expect(schedule.dueDate).toBe("2026-09-21");
      expect(schedule.alertId).toBeUndefined();
    } finally {
      await f.close();
    }
  });
});
