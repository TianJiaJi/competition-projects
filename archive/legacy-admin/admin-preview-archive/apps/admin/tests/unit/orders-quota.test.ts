import { beforeEach, describe, expect, it } from "vitest";
import { bootContext } from "./helpers";
import { adminCancelOrder, adminGetOrder, adminListOrders, adminListSlots, adminRescheduleOrder, getOverview, saveSlotCapacity } from "../../src/services/orders";
import { createActionId } from "../../src/core/result";
import { businessNow, toDateString } from "../../src/core/time";

const today = toDateString(businessNow());

async function slotId(start: string, lotId?: string): Promise<string> {
  const slots = await adminListSlots({ date: today, type: lotId ? "parking" : "admission", lotId: lotId ?? "all" });
  if (!slots.ok) throw new Error("slots unavailable");
  const slot = slots.data.find((item) => item.start === start && (!lotId || item.lotId === lotId));
  if (!slot) throw new Error(`slot ${start} ${lotId ?? ""} not found`);
  return slot.id;
}

async function slotView(start: string, lotId?: string) {
  const slots = await adminListSlots({ date: today, type: lotId ? "parking" : "admission", lotId: lotId ?? "all" });
  if (!slots.ok) throw new Error("slots unavailable");
  return slots.data.find((item) => item.start === start && (!lotId || item.lotId === lotId))!;
}

describe("订单与配额的原子规则（§4.1）", () => {
  beforeEach(() => {
    bootContext();
  });

  it("AC-08：A→B 改期后两档配额与订单同时更新，在园人数不变", async () => {
    const beforeOverview = await getOverview();
    expect(beforeOverview.ok).toBe(true);
    const admissionBefore = beforeOverview.ok ? beforeOverview.data.admissionPeople : 0;

    const a = await slotView("15:00");
    const b = await slotView("16:00");
    expect(a.interactiveBooked).toBe(12);
    expect(b.interactiveBooked).toBe(8);

    const result = await adminRescheduleOrder("ORD-20260912-0001", {
      targetSlotId: await slotId("16:00"),
      note: "游客改到下一档",
      actionId: createActionId("reschedule"),
    });
    expect(result.ok).toBe(true);

    const afterA = await slotView("15:00");
    const afterB = await slotView("16:00");
    expect(afterA.interactiveBooked).toBe(9);
    expect(afterB.interactiveBooked).toBe(11);
    expect(afterA.remaining).toBe(23);
    expect(afterB.remaining).toBe(19);

    const order = await adminGetOrder("ORD-20260912-0001");
    expect(order.ok && order.data.slotStart).toBe("16:00");
    expect(order.ok && order.data.history.at(-1)?.action).toBe("reschedule");

    const afterOverview = await getOverview();
    expect(afterOverview.ok && afterOverview.data.admissionPeople).toBe(admissionBefore);
  });

  it("AC-09：目标档只余 2 时整体失败，原订单与配额不变", async () => {
    const failure = await adminRescheduleOrder("ORD-20260912-0001", {
      targetSlotId: await slotId("16:00"),
      note: "先占满目标档",
      actionId: createActionId("reschedule"),
    });
    expect(failure.ok).toBe(true);
    await saveSlotCapacity({ slotId: await slotId("16:00"), interactiveQuota: 11 });
    const b = await slotView("16:00");
    expect(b.remaining).toBe(0);

    const second = await adminRescheduleOrder("ORD-20260912-0002", {
      targetSlotId: await slotId("16:00"),
      note: "目标不足",
      actionId: createActionId("reschedule"),
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("SLOT_FULL");

    const a = await slotView("15:00");
    expect(a.interactiveBooked).toBe(9);
    const order = await adminGetOrder("ORD-20260912-0002");
    expect(order.ok && order.data.slotStart).toBe("15:00");
  });

  it("AC-07 + AC-25：取消只释放一次，同一动作标识重试不重复迁移", async () => {
    const before = await slotView("15:00");
    expect(before.interactiveBooked).toBe(12);
    const actionId = createActionId("cancel");

    const first = await adminCancelOrder("ORD-20260912-0001", { reason: "游客行程变化", actionId });
    expect(first.ok).toBe(true);
    const afterFirst = await slotView("15:00");
    expect(afterFirst.interactiveBooked).toBe(9);

    const retry = await adminCancelOrder("ORD-20260912-0001", { reason: "游客行程变化", actionId });
    expect(retry.ok).toBe(true);
    const afterRetry = await slotView("15:00");
    expect(afterRetry.interactiveBooked).toBe(9);

    const duplicate = await adminCancelOrder("ORD-20260912-0001", { reason: "再次点击", actionId: createActionId("cancel") });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.error.code).toBe("ORDER_STATE_CONFLICT");
  });

  it("AC-09：已入园、已失效、背景批次与同档提交都不改变数据", async () => {
    const inPark = await adminCancelOrder("ORD-20260912-0003", { reason: "尝试取消已入园" });
    expect(inPark.ok).toBe(false);
    if (!inPark.ok) expect(inPark.error.message).toContain("已经入园");

    const expired = await adminCancelOrder("ORD-20260912-0007", { reason: "尝试取消失效单" });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error.code).toBe("ORDER_STATE_CONFLICT");

    const backgroundBatch = await adminCancelOrder("BATCH-20260912-A-0009", { reason: "尝试取消背景批次" });
    expect(backgroundBatch.ok).toBe(false);
    if (!backgroundBatch.ok) expect(backgroundBatch.error.message).toContain("背景模拟批次");

    const sameSlot = await adminRescheduleOrder("ORD-20260912-0001", { targetSlotId: await slotId("15:00") });
    expect(sameSlot.ok).toBe(true);
    expect(sameSlot.ok && sameSlot.data.unchanged).toBe(true);
    const a = await slotView("15:00");
    expect(a.interactiveBooked).toBe(12);
  });

  it("AC-11：停车停用后仍保留占用与订单，p1 不能作为改期目标", async () => {
    const slots = await adminListSlots({ date: today, type: "parking", lotId: "p1" });
    expect(slots.ok).toBe(true);
    const p1 = slots.ok ? slots.data.find((slot) => slot.start === "15:00") : undefined;
    expect(p1?.interactiveBooked).toBe(5);

    const { updateFacilityState } = await import("../../src/services/facilities");
    const closed = await updateFacilityState("p1", { state: "closed", reason: "边坡作业" });
    expect(closed.ok).toBe(true);

    const after = await adminListSlots({ date: today, type: "parking", lotId: "p1" });
    const closedSlot = after.ok ? after.data.find((slot) => slot.start === "15:00") : undefined;
    expect(closedSlot?.interactiveBooked).toBe(5);
    expect(closedSlot?.bookable).toBe(false);
    expect(closedSlot?.unbookableReason).toBe("停车场当前停用");

    const unchangedQuota = await saveSlotCapacity({ slotId: closedSlot!.id, interactiveQuota: 30 });
    expect(unchangedQuota.ok).toBe(true);
    const stillClosed = await adminListSlots({ date: today, type: "parking", lotId: "p1" });
    const reopenedView = stillClosed.ok ? stillClosed.data.find((slot) => slot.start === "15:00") : undefined;
    expect(reopenedView?.unbookableReason).toBe("停车场当前停用");
    expect(reopenedView?.interactiveQuota).toBe(30);
  });

  it("AC-10：配额只接受不小于已占的非负整数", async () => {
    const target = await slotId("15:00");
    const ok40 = await saveSlotCapacity({ slotId: target, interactiveQuota: 40 });
    expect(ok40.ok).toBe(true);
    expect(ok40.ok && ok40.data.remaining).toBe(28);

    const tooLow = await saveSlotCapacity({ slotId: target, interactiveQuota: 11 });
    expect(tooLow.ok).toBe(false);
    const negative = await saveSlotCapacity({ slotId: target, interactiveQuota: -1 });
    expect(negative.ok).toBe(false);
    const fractional = await saveSlotCapacity({ slotId: target, interactiveQuota: 12.5 });
    expect(fractional.ok).toBe(false);

    const view = await slotView("15:00");
    expect(view.interactiveQuota).toBe(40);
    expect(view.interactiveBooked).toBe(12);

    const parkingStats = await import("../../src/services/facilities");
    const p1 = await parkingStats.getFacility("p1");
    expect(p1.ok && p1.data.facility.metrics.some((metric) => metric.label === "物理余位" && metric.value === "22 辆")).toBe(true);
  });

  it("背景批次不占现场配额，工作台指标包含背景模拟", async () => {
    const a = await slotView("15:00");
    expect(a.interactiveBooked).toBe(12);
    const orders = await adminListOrders({ date: today, type: "admission", source: "background" });
    expect(orders.ok && orders.data.total).toBe(2);
    const overview = await getOverview();
    expect(overview.ok && overview.data.includedBackground).toBe(true);
  });
});
