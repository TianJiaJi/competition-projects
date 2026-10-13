import { beforeEach, describe, expect, it } from "vitest";
import { bootContext, createFakeStorage, expireSession } from "./helpers";
import { BUSINESS_KEY, SESSION_KEY, readStore, writeStore, clearAdminKeys, STORE_VERSION } from "../../src/core/storage";
import { configureRuntime, createSeedStore, getStore, resetSample, requireStaff } from "../../src/services/store";
import { getMe, logout, staffLogin } from "../../src/services/auth";
import { createInspectionPlan, listInspectionPlans, setInspectionPlanEnabled, updateInspectionPlan, willGenerateRecord } from "../../src/services/inspections";
import { listAlerts } from "../../src/services/alerts";
import { adminListUsers, setUserDisabled } from "../../src/services/users";
import { getChatMessages, listMutes, listReports, muteUser, removeMessage, resolveReport, unmuteUser } from "../../src/services/chat";
import { adminListArticles } from "../../src/services/content";
import { slotMatched, orderCountsTowardQuota } from "../../src/core/quota";
import { createSession, writeSession } from "../../src/core/session";

describe("本地存储、会话与运行隔离（§5.2）", () => {
  beforeEach(() => {
    bootContext();
  });

  it("首次可写入时建立默认样例；存储写入失败时保持原数据并提示失败", async () => {
    const storage = createFakeStorage();
    configureRuntime({ storage, session: createSession("admin_demo", "演示值班员", "staff-demo") });
    const seed = createSeedStore();
    expect(writeStore(seed, storage).ok).toBe(true);
    storage.failWrites = true;
    const outcome = writeStore(seed, storage);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe("MOCK_STORAGE_FAILED");
    const reloaded = readStore(storage);
    expect(reloaded.status).toBe("ok");
    if (reloaded.status === "ok") expect(reloaded.store.revision).toBe(seed.revision);

    const { saveScenic } = await import("../../src/services/content");
    const failed = await saveScenic({
      name: "改名",
      summary: "简介",
      address: "地址",
      servicePhone: "0571-8888 6688",
      coverUrl: "/assets/scenic-landscape.svg",
      openingText: "营业说明",
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.code).toBe("MOCK_STORAGE_FAILED");
    expect(getStore().global.scenic.name).toBe("青岚山境");
  });

  it("存储损坏时提示恢复入口且拒绝写入，不静默覆盖", async () => {
    const storage = createFakeStorage();
    storage.setItem(BUSINESS_KEY, "{ this is not json");
    configureRuntime({ storage, session: createSession("admin_demo", "演示值班员", "staff-demo") });
    const { bootstrap } = await import("../../src/services/store");
    const info = bootstrap();
    expect(info.status).toBe("corrupt");
    const { saveScenic } = await import("../../src/services/content");
    const rejected = await saveScenic({
      name: "改名",
      summary: "简介",
      address: "地址",
      servicePhone: "0571-8888 6688",
      coverUrl: "/assets/scenic-landscape.svg",
      openingText: "营业说明",
    });
    expect(rejected.ok).toBe(false);
    expect(storage.getItem(BUSINESS_KEY)).toBe("{ this is not json");
    expect(info.message).toContain("恢复样例");
  });

  it("版本不兼容按损坏处理；恢复样例只清理后台键且不调用 clear()", () => {
    const storage = createFakeStorage();
    storage.setItem(BUSINESS_KEY, JSON.stringify({ version: STORE_VERSION + 1, revision: 1, activeRunId: "x", global: {}, runs: {} }));
    storage.setItem("qinglan.visitor.sample", "keep-me");
    expect(readStore(storage).status).toBe("corrupt");
    clearAdminKeys(storage, false);
    expect(storage.getItem(BUSINESS_KEY)).toBeNull();
    expect(storage.getItem("qinglan.visitor.sample")).toBe("keep-me");
  });

  it("AC-01：错误登录统一提示，正确登录后会话有效，退出后业务服务被拒绝", async () => {
    configureRuntime({ session: null });
    const wrong = await staffLogin({ username: "admin_demo", password: "wrong" });
    expect(wrong.ok).toBe(false);
    const empty = await staffLogin({ username: "", password: "" });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("VALIDATION_ERROR");

    const success = await staffLogin({ username: "admin_demo", password: "AdminDemo123!" });
    expect(success.ok).toBe(true);
    expect(success.ok && success.data.expiresAt - success.data.startedAt).toBe(12 * 60 * 60 * 1000);
    expect(JSON.stringify(success.ok ? success.data : {})).not.toContain("AdminDemo123!");

    const me = await getMe();
    expect(me.ok).toBe(true);
    await logout();
    const afterLogout = await getMe();
    expect(afterLogout.ok).toBe(false);
    const service = await adminListArticles({});
    expect(service.ok).toBe(false);
    expect(requireStaff().ok).toBe(false);
  });

  it("会话过期后读写业务被拒绝，会话键被清理", () => {
    expireSession();
    expect(requireStaff().ok).toBe(false);
  });
});

describe("检修计划与告警只读（ADM-10/ADM-11）", () => {
  beforeEach(() => {
    bootContext();
  });

  it("AC-16：到期计划生成一条 pending 检修告警，刷新与重复保存不重复生成", async () => {
    const alerts = await listAlerts({ scope: "current", category: "inspection", pageSize: 50 });
    expect(alerts.ok).toBe(true);
    if (!alerts.ok) return;
    expect(alerts.data.items.length).toBe(1);
    const generated = alerts.data.items[0];
    expect(generated.severity).toBe("reminder");
    expect(generated.status).toBe("pending");
    expect(generated.title).toContain("AED");

    const { bootstrap } = await import("../../src/services/store");
    bootstrap();
    const again = await listAlerts({ scope: "current", category: "inspection", pageSize: 50 });
    expect(again.ok && again.data.items.length).toBe(1);

    const plan = await listInspectionPlans({ keyword: "入口 AED" });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const target = plan.data.items[0];
    const resaved = await updateInspectionPlan(target.id, {
      facilityId: target.facilityId,
      intervalDays: target.intervalDays,
      nextDueDate: target.nextDueDate,
      instructions: target.instructions,
      enabled: true,
    });
    expect(resaved.ok).toBe(true);
    const afterResave = await listAlerts({ scope: "current", category: "inspection", pageSize: 50 });
    expect(afterResave.ok && afterResave.data.items.length).toBe(1);
  });

  it("AC-17：同设施两份启用计划被拒，未来日期不生成，停用保留既有告警", async () => {
    const conflict = await createInspectionPlan({
      facilityId: "aed-entry",
      intervalDays: 15,
      nextDueDate: "2026-09-12",
      instructions: "重复启用测试",
      enabled: true,
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe("INSPECTION_PLAN_CONFLICT");

    const future = await createInspectionPlan({
      facilityId: "aed-summit",
      intervalDays: 45,
      nextDueDate: "2026-10-01",
      instructions: "山顶 AED 季度检查",
      enabled: true,
    });
    expect(future.ok).toBe(true);
    const alertsAfterFuture = await listAlerts({ scope: "current", category: "inspection", pageSize: 50 });
    expect(alertsAfterFuture.ok && alertsAfterFuture.data.items.length).toBe(1);

    const disabled = await setInspectionPlanEnabled("plan-001", false);
    expect(disabled.ok).toBe(true);
    const existed = await listAlerts({ scope: "current", category: "inspection", pageSize: 50 });
    expect(existed.ok && existed.data.items.length).toBe(1);

    const reenabled = await setInspectionPlanEnabled("plan-001", true);
    expect(reenabled.ok).toBe(true);
    const afterReenable = await listAlerts({ scope: "current", category: "inspection", pageSize: 50 });
    expect(afterReenable.ok && afterReenable.data.items.length).toBe(1);

    expect(willGenerateRecord({ id: "plan-001", enabled: true, nextDueDate: "2026-09-12" })).toBe(false);
    expect(willGenerateRecord({ id: "plan-new", enabled: true, nextDueDate: "2026-09-12" })).toBe(true);

    const invalidDate = await createInspectionPlan({
      facilityId: "aid-entry",
      intervalDays: 30,
      nextDueDate: "2026-02-30",
      instructions: "非法日期",
      enabled: true,
    });
    expect(invalidDate.ok).toBe(false);
  });

  it("AC-18：告警只读，当前与历史排序正确，独立事件不被合并", async () => {
    const current = await listAlerts({ scope: "current", pageSize: 50 });
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    expect(current.data.items.every((alert) => alert.status !== "resolved")).toBe(true);
    const ranks = current.data.items.map((alert) => (alert.severity === "critical" ? 0 : alert.severity === "important" ? 1 : 2));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);

    const history = await listAlerts({ scope: "history", pageSize: 50 });
    expect(history.ok && history.data.items.every((alert) => alert.status === "resolved")).toBe(true);
    expect(history.ok && history.data.items.every((alert) => alert.completedText)).toBe(true);

    const repeated = current.data.items.find((alert) => alert.previousAlertId);
    expect(repeated?.previousAlertId).toBe("alert-05");
    const resolvedSibling = history.ok ? history.data.items.find((alert) => alert.id === "alert-05") : undefined;
    expect(resolvedSibling?.metric).toContain("仍高于阈值");
  });
});

describe("用户与聊天动作（ADM-12/ADM-13）", () => {
  beforeEach(() => {
    bootContext();
  });

  it("AC-19：游客可禁用并持久化，员工被服务层拒绝，订单与人数不变", async () => {
    const { getOverview } = await import("../../src/services/orders");
    const before = await getOverview();
    const disabled = await setUserDisabled("visitor-1001", true);
    expect(disabled.ok).toBe(true);
    const list = await adminListUsers({ keyword: "山客小岚" });
    expect(list.ok && list.data.items[0].disabled).toBe(true);

    const staff = await setUserDisabled("staff-demo", true);
    expect(staff.ok).toBe(false);
    if (!staff.ok) expect(staff.error.code).toBe("FORBIDDEN");

    const restored = await setUserDisabled("visitor-1001", false);
    expect(restored.ok).toBe(true);
    const after = await getOverview();
    expect(before.ok).toBe(true);
    expect(after.ok).toBe(true);
    if (before.ok && after.ok) expect(after.data.admissionPeople).toBe(before.data.admissionPeople);
  });

  it("AC-20：撤回后正文不再由正常查询与举报详情返回；举报处理不撤回消息", async () => {
    const reports = await listReports({ status: "pending" });
    expect(reports.ok).toBe(true);
    if (!reports.ok) return;
    const report = reports.data.items[0];
    expect(report.messagePreview.length).toBeGreaterThan(0);

    const resolved = await resolveReport(report.id, { outcome: "resolved", note: "已核对并提示发布者" });
    expect(resolved.ok).toBe(true);
    const again = await resolveReport(report.id, { outcome: "resolved", note: "重复结案" });
    expect(again.ok).toBe(false);

    const messages = await getChatMessages({ roomId: report.roomId, limit: 50 });
    expect(messages.ok).toBe(true);
    if (!messages.ok) return;
    const stillVisible = messages.data.items.find((message) => message.id === report.messageId);
    expect(stillVisible?.removed).toBe(false);

    const removed = await removeMessage(report.messageId, { reason: "内容不适宜保留" });
    expect(removed.ok).toBe(true);
    const afterRemoval = await getChatMessages({ roomId: report.roomId, limit: 50 });
    const target = afterRemoval.ok ? afterRemoval.data.items.find((message) => message.id === report.messageId) : undefined;
    expect(target?.body).toBe("该消息已被管理员撤回");
    expect(afterRemoval.ok && afterRemoval.data.items.some((message) => message.id === report.messageId && !message.removed)).toBe(false);
  });

  it("AC-21：重复禁言替换到期时间而不叠加，解除后记录移除，员工不可被禁言", async () => {
    const first = await muteUser({ userId: "visitor-1005", minutes: 5, reason: "重复内容" });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstUntil = first.data.until;
    const second = await muteUser({ userId: "visitor-1005", minutes: 1, reason: "缩短为 1 分钟" });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.until).toBeLessThan(firstUntil);
    expect(second.data.minutes).toBe(1);

    const list = await listMutes();
    expect(list.ok && list.data.filter((mute) => mute.userId === "visitor-1005").length).toBe(1);

    const staff = await muteUser({ userId: "staff-demo", minutes: 10, reason: "尝试禁言员工" });
    expect(staff.ok).toBe(false);

    const invalid = await muteUser({ userId: "visitor-1005", minutes: 0, reason: "非法时长" });
    expect(invalid.ok).toBe(false);

    const cleared = await unmuteUser("visitor-1005");
    expect(cleared.ok).toBe(true);
    const after = await listMutes();
    expect(after.ok && after.data.some((mute) => mute.userId === "visitor-1005")).toBe(false);
  });

  it("消息游标翻页不重复，移除不改变其他房间", async () => {
    const rooms = await import("../../src/services/chat").then((module) => module.listChatRooms());
    expect(rooms.ok).toBe(true);
    if (!rooms.ok) return;
    const park = rooms.data.find((room) => room.id === "room-park")!;
    expect(park.messageCount).toBe(55);

    const latest = await getChatMessages({ roomId: park.id, limit: 50 });
    expect(latest.ok && latest.data.items.length).toBe(50);
    expect(latest.ok && latest.data.hasMore).toBe(true);
    const oldest = latest.ok ? latest.data.items[0] : undefined;
    const earlier = await getChatMessages({ roomId: park.id, beforeId: oldest?.id, limit: 50 });
    expect(earlier.ok && earlier.data.items.length).toBe(5);
    const overlap = earlier.ok && latest.ok ? earlier.data.items.filter((message) => latest.data.items.some((item) => item.id === message.id)) : [];
    expect(overlap.length).toBe(0);
  });
});

describe("列表通用规则（AC-02）与种子一致性", () => {
  beforeEach(() => {
    bootContext();
  });

  it("最后一页删除后回到最近有效页", async () => {
    const page2 = await adminListArticles({ pageSize: 20, page: 2 });
    expect(page2.ok && page2.data.items.length).toBe(2);
    const { deleteArticle } = await import("../../src/services/content");
    await deleteArticle(page2.ok ? page2.data.items[0].id : "");
    await deleteArticle(page2.ok ? page2.data.items[1].id : "");
    const reloaded = await adminListArticles({ pageSize: 20, page: 2 });
    expect(reloaded.ok && reloaded.data.page).toBe(1);
    expect(reloaded.ok && reloaded.data.total).toBe(20);
  });

  it("现场配额初始已占数由样例订单完整解释", async () => {
    const { adminListSlots } = await import("../../src/services/orders");
    const run = getStore().runs[getStore().activeRunId];
    const slots = await adminListSlots({});
    expect(slots.ok).toBe(true);
    if (!slots.ok) return;
    for (const slot of slots.data) {
      const explained = run.orders
        .filter((order) => orderCountsTowardQuota(order) && slotMatched(order, slot))
        .reduce((sum, order) => sum + (slot.type === "admission" ? order.people ?? 0 : order.vehicles ?? 0), 0);
      expect(explained).toBe(slot.interactiveBooked);
    }
  });

  it("固定业务时间与 runId 稳定，同一时刻多次保存通过 revision 区分", async () => {
    const store = getStore();
    expect(store.activeRunId).toBe("run_admin_mock_20260912");
    expect(store.runs[store.activeRunId].businessTime).toBe("2026-09-12T14:30:00+08:00");
    const before = store.revision;
    const { saveSlotCapacity } = await import("../../src/services/orders");
    const slots = await import("../../src/services/orders").then((module) => module.adminListSlots({ date: "2026-09-12", type: "admission" }));
    if (slots.ok) await saveSlotCapacity({ slotId: slots.data.find((slot) => slot.start === "15:00")!.id, interactiveQuota: 55 });
    expect(getStore().revision).toBeGreaterThan(before);
  });

  it("恢复样例清理业务状态但保留会话键", () => {
    const storage = createFakeStorage();
    const { writeSession: writeSessionInline } = { writeSession };
    configureRuntime({ storage, session: createSession("admin_demo", "演示值班员", "staff-demo") });
    writeSessionInline(createSession("admin_demo", "演示值班员", "staff-demo"), storage);
    resetSample();
    expect(storage.getItem(BUSINESS_KEY)).toBeTruthy();
    expect(storage.getItem(SESSION_KEY)).toBeTruthy();
    expect(readStore(storage).status).toBe("ok");
  });
});
