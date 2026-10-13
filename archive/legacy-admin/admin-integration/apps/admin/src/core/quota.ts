import type { FacilityStateRecord, Order, Slot, SlotView } from "./types";
import { businessNow, isSlotEnded, orderWindowEndMs, addDays, toDateString } from "./time";

/** 现场配额：尚有效未消费与已经消费的现场预约都计入，背景批次不占现场配额。 */
export function orderCountsTowardQuota(order: Order): boolean {
  return order.source === "onsite" && order.reservationStatus === "confirmed";
}

export function slotMatched(order: Order, slot: Slot): boolean {
  if (order.type !== slot.type) return false;
  if (order.slotDate !== slot.date || order.slotStart !== slot.start || order.slotEnd !== slot.end) return false;
  if (slot.type === "parking") return (order.parkingLotId ?? "") === (slot.lotId ?? "");
  return true;
}

export function bookedForSlot(slot: Slot, orders: Order[]): number {
  return orders
    .filter((order) => orderCountsTowardQuota(order) && slotMatched(order, slot))
    .reduce((sum, order) => sum + (slot.type === "admission" ? order.people ?? 0 : order.vehicles ?? 0), 0);
}

export function buildSlotView(
  slot: Slot,
  orders: Order[],
  facilityStates: Record<string, FacilityStateRecord>,
  now = businessNow(),
): SlotView {
  const interactiveBooked = bookedForSlot(slot, orders);
  const remaining = Math.max(0, slot.interactiveQuota - interactiveBooked);
  const slotWindow = isSlotEnded(slot, now);
  let unbookableReason: string | undefined;
  if (slotWindow.ended) unbookableReason = "时段已结束";
  else if (slot.type === "parking") {
    const state = slot.lotId ? facilityStates[slot.lotId]?.state ?? "open" : "open";
    if (state !== "open") unbookableReason = "停车场当前停用";
  }
  if (!unbookableReason && remaining === 0) unbookableReason = "现场配额已满";
  return {
    ...slot,
    interactiveBooked,
    remaining,
    bookable: !unbookableReason,
    unbookableReason,
  };
}

export function buildSlotViews(
  slots: Slot[],
  orders: Order[],
  facilityStates: Record<string, FacilityStateRecord>,
  now = businessNow(),
): SlotView[] {
  return slots
    .map((slot) => buildSlotView(slot, orders, facilityStates, now))
    .sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
}

export interface OrderEligibility {
  canCancel: boolean;
  canReschedule: boolean;
  reason?: string;
}

/** 取消／改期资格：现场、有效，且入园未入园／停车未到场或等候中，仍在有效窗口内。 */
export function orderEligibility(order: Order, now = businessNow()): OrderEligibility {
  if (order.source === "background") {
    return { canCancel: false, canReschedule: false, reason: "背景模拟批次记录只读，不能取消或改期" };
  }
  if (order.reservationStatus === "cancelled") {
    return { canCancel: false, canReschedule: false, reason: "该订单已取消，不能重复操作" };
  }
  if (order.reservationStatus === "expired") {
    return { canCancel: false, canReschedule: false, reason: "该订单已失效，没有重新激活入口" };
  }
  if (now >= orderWindowEndMs(order)) {
    return { canCancel: false, canReschedule: false, reason: "已超过订单有效窗口" };
  }
  if (order.type === "admission") {
    if (order.visitStatus === "in_park") return { canCancel: false, canReschedule: false, reason: "该订单已经入园，不能取消" };
    if (order.visitStatus === "exited") return { canCancel: false, canReschedule: false, reason: "该订单已经离园，不能取消" };
    return { canCancel: true, canReschedule: true };
  }
  if (order.parkingStatus === "parked") return { canCancel: false, canReschedule: false, reason: "该车辆已经进场，不能取消" };
  if (order.parkingStatus === "departed") return { canCancel: false, canReschedule: false, reason: "该车辆已经离场，不能取消" };
  return { canCancel: true, canReschedule: true };
}

export function orderSlotLabel(order: Order): string {
  return `${order.slotDate} ${order.slotStart}—${order.slotEnd}`;
}

export function slotLabel(slot: Slot): string {
  return `${slot.date} ${slot.start}—${slot.end}`;
}

/** 目标档必须类型一致、当天未结束或次日，停车还需目标停车场开放。 */
export function targetSlotProblem(
  order: Order,
  target: Slot,
  booked: number,
  facilityOpen: boolean,
  now = businessNow(),
): string | undefined {
  if (target.type !== order.type) return "目标时段类型与原订单不一致";
  const window = isSlotEnded(target, now);
  const todayString = toDateString(now);
  if (window.ended) return "目标时段已经结束";
  if (target.date !== todayString && target.date !== addDays(todayString, 1)) return "只能改期到当天未结束档或次日档";
  if (target.type === "parking" && !facilityOpen) return "目标停车场当前不可用";
  const remain = target.interactiveQuota - booked;
  const needed = order.type === "admission" ? order.people ?? 0 : order.vehicles ?? 0;
  if (remain < needed) return "目标时段剩余名额不足";
  return undefined;
}
