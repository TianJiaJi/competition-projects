import { businessNow, fromShanghai, toDateString } from "../core/time";
import { LIMITS, checkText, collectErrors, isNonNegativeInteger } from "../core/validate";
import { buildSlotViews, bookedForSlot, orderEligibility, orderSlotLabel, slotLabel, targetSlotProblem, type OrderEligibility } from "../core/quota";
import type { Order, OrderActionRecord, SlotView } from "../core/types";
import { fail, ok, type ApiResult } from "../core/result";
import { getRun, mutate, requireStaff } from "./store";
import { matchKeyword, paginate, type ListQuery, type ListResult } from "./list";

async function settle<T>(value: T, ms = 140): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}

export interface OrderQuery extends ListQuery {
  type?: Order["type"] | "all";
  date?: string;
  source?: Order["source"] | "all";
  reservationStatus?: Order["reservationStatus"] | "all";
  fulfillmentStatus?: string;
  keyword?: string;
}

export interface OrderView extends Order {
  slotLabel: string;
  eligibility: OrderEligibility;
}

export function buildOrderView(order: Order, now = businessNow()): OrderView {
  return { ...order, slotLabel: orderSlotLabel(order), eligibility: orderEligibility(order, now) };
}

export function orderMatches(order: Order, query: OrderQuery, now = businessNow()): boolean {
  if (query.type && query.type !== "all" && order.type !== query.type) return false;
  if (query.date && order.slotDate !== query.date) return false;
  if (query.source && query.source !== "all" && order.source !== query.source) return false;
  if (query.reservationStatus && query.reservationStatus !== "all" && order.reservationStatus !== query.reservationStatus) {
    return false;
  }
  if (query.fulfillmentStatus && query.fulfillmentStatus !== "all") {
    const status = order.type === "admission" ? order.visitStatus : order.parkingStatus;
    if (status !== query.fulfillmentStatus) return false;
  }
  const keyword = (query.keyword ?? "").trim();
  if (!keyword) return true;
  if (order.source === "background") {
    // 背景批次没有真人信息，只按订单编号匹配。
    return matchKeyword(keyword, [order.id, order.batchId]);
  }
  return matchKeyword(keyword, [order.id, order.contactName, order.contactPhone, order.plate]);
}

export async function adminListOrders(query: OrderQuery = {}): Promise<ApiResult<ListResult<OrderView>>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const now = businessNow();
  const items = getRun()
    .orders.filter((order) => orderMatches(order, query, now))
    .map((order) => buildOrderView(order, now))
    .sort((a, b) => (b.updatedAt === a.updatedAt ? b.id.localeCompare(a.id) : b.updatedAt - a.updatedAt));
  return settle(ok(paginate(items, query)));
}

export async function adminGetOrder(id: string): Promise<ApiResult<OrderView>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const order = getRun().orders.find((item) => item.id === id);
  if (!order) return settle(fail("NOT_FOUND", "没有找到对应的订单。"));
  return settle(ok(buildOrderView(order)));
}

export interface CancelOrderInput {
  reason: string;
  actionId?: string;
  actor?: string;
}

export async function adminCancelOrder(id: string, input: CancelOrderInput): Promise<ApiResult<OrderView>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const errors = collectErrors([checkText(input.reason, "reason", LIMITS.reason, "操作原因")]);
  if (errors.length) return settle(fail("VALIDATION_ERROR", "取消订单需要填写操作原因。", { fieldErrors: errors }));
  return settle(
    mutate(
      "adminCancelOrder",
      (draft) => {
        const run = draft.runs[draft.activeRunId];
        const order = run.orders.find((item) => item.id === id);
        if (!order) return fail("NOT_FOUND", "没有找到对应的订单。");
        const now = businessNow();
        const eligibility = orderEligibility(order, now);
        if (!eligibility.canCancel) {
          return fail("ORDER_STATE_CONFLICT", eligibility.reason ?? "订单当前状态不允许取消。");
        }
        const record: OrderActionRecord = {
          at: now,
          actor: input.actor ?? "演示值班员",
          action: "cancel",
          fromSlot: orderSlotLabel(order),
          toSlot: orderSlotLabel(order),
          note: input.reason.trim(),
        };
        order.reservationStatus = "cancelled";
        order.history.push(record);
        order.updatedAt = now;
        return ok(buildOrderView(order, now));
      },
      input.actionId,
    ),
  );
}

export interface RescheduleOrderInput {
  targetSlotId: string;
  note?: string;
  actionId?: string;
  actor?: string;
}

export async function adminRescheduleOrder(id: string, input: RescheduleOrderInput): Promise<ApiResult<OrderView & { unchanged: boolean }>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  if (input.note !== undefined && input.note.trim().length > LIMITS.reason.max) {
    return settle(fail("VALIDATION_ERROR", "改期说明过长。", { fieldErrors: [{ field: "note", message: `不超过 ${LIMITS.reason.max} 字` }] }));
  }
  return settle(
    mutate<OrderView & { unchanged: boolean }>(
      "adminRescheduleOrder",
      (draft): ApiResult<OrderView & { unchanged: boolean }> => {
        const run = draft.runs[draft.activeRunId];
        const order = run.orders.find((item) => item.id === id);
        if (!order) return fail("NOT_FOUND", "没有找到对应的订单。");
        const now = businessNow();
        const eligibility = orderEligibility(order, now);
        if (!eligibility.canReschedule) {
          return fail("ORDER_STATE_CONFLICT", eligibility.reason ?? "订单当前状态不允许改期。");
        }
        const target = run.slots.find((slot) => slot.id === input.targetSlotId);
        if (!target) return fail("NOT_FOUND", "没有找到目标时段。");
        const sameSlot =
          target.date === order.slotDate &&
          target.start === order.slotStart &&
          (target.type === "admission" || (target.lotId ?? "") === (order.parkingLotId ?? ""));
        if (sameSlot) {
          return ok({ ...buildOrderView(order, now), unchanged: true });
        }
        const lotState = target.type === "parking" ? run.facilityStates[target.lotId ?? ""]?.state ?? "open" : "open";
        const booked = bookedForSlot(target, run.orders.filter((item) => item.id !== order.id));
        const problem = targetSlotProblem(order, target, booked, lotState === "open", now);
        if (problem) {
          const code = problem.includes("名额") ? "SLOT_FULL" : problem.includes("不可用") ? "FACILITY_CLOSED" : "ORDER_STATE_CONFLICT";
          return fail(code, problem);
        }
        const fromSlot = orderSlotLabel(order);
        order.slotDate = target.date;
        order.slotStart = target.start;
        order.slotEnd = target.end;
        if (target.type === "parking") order.parkingLotId = target.lotId;
        order.updatedAt = now;
        order.history.push({
          at: now,
          actor: input.actor ?? "演示值班员",
          action: "reschedule",
          fromSlot,
          toSlot: slotLabel(target),
          note: input.note?.trim() ?? "",
        });
        return ok({ ...buildOrderView(order, now), unchanged: false });
      },
      input.actionId,
    ),
  );
}

export interface SlotQuery {
  date?: string;
  type?: Order["type"] | "all";
  lotId?: string | "all";
}

export async function adminListSlots(query: SlotQuery = {}): Promise<ApiResult<SlotView[]>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const run = getRun();
  const views = buildSlotViews(run.slots, run.orders, run.facilityStates).filter((slot) => {
    if (query.date && slot.date !== query.date) return false;
    if (query.type && query.type !== "all" && slot.type !== query.type) return false;
    if (query.lotId && query.lotId !== "all" && slot.lotId !== query.lotId) return false;
    return true;
  });
  return settle(ok(views));
}

export interface SaveSlotCapacityInput {
  slotId: string;
  interactiveQuota: number;
}

export async function saveSlotCapacity(input: SaveSlotCapacityInput): Promise<ApiResult<SlotView>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  if (!isNonNegativeInteger(input.interactiveQuota)) {
    return settle(fail("VALIDATION_ERROR", "配额必须是非负整数。", { fieldErrors: [{ field: "interactiveQuota", message: "请输入非负整数" }] }));
  }
  return settle(
    mutate("saveSlotCapacity", (draft) => {
      const run = draft.runs[draft.activeRunId];
      const slot = run.slots.find((item) => item.id === input.slotId);
      if (!slot) return fail("NOT_FOUND", "没有找到对应时段。");
      const view = buildSlotViews([slot], run.orders, run.facilityStates)[0];
      if (view.interactiveBooked > input.interactiveQuota) {
        return fail("VALIDATION_ERROR", `配额不能低于已占用的 ${view.interactiveBooked}。`, {
          fieldErrors: [{ field: "interactiveQuota", message: `已占 ${view.interactiveBooked}，不能低于该值` }],
        });
      }
      slot.interactiveQuota = input.interactiveQuota;
      return ok(buildSlotViews([slot], run.orders, run.facilityStates)[0]);
    }),
  );
}

export interface OverviewMetrics {
  businessDate: string;
  admissionPeople: number;
  parkingVehicles: number;
  pendingAlertCount: number;
  pendingReportCount: number;
  includedBackground: true;
  latestAlerts: Array<{ id: string; title: string; severity: string; location: string; startedAt: string }>;
}

export async function getOverview(): Promise<ApiResult<OverviewMetrics>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const run = getRun();
  const now = businessNow();
  const date = toDateString(now);
  let admissionPeople = 0;
  let parkingVehicles = 0;
  for (const order of run.orders) {
    if (order.slotDate !== date || order.reservationStatus !== "confirmed") continue;
    if (order.type === "admission") admissionPeople += order.people ?? 0;
    else parkingVehicles += order.vehicles ?? 0;
  }
  const openAlerts = run.alerts.filter((alert) => alert.status === "pending" || alert.status === "processing");
  const severityRank: Record<string, number> = { critical: 0, important: 1, reminder: 2 };
  const latestAlerts = [...openAlerts]
    .sort((a, b) => {
      const rank = (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3);
      if (rank !== 0) return rank;
      return Date.parse(b.startedAt) - Date.parse(a.startedAt);
    })
    .slice(0, 5)
    .map((alert) => ({
      id: alert.id,
      title: alert.title,
      severity: alert.severity,
      location: alert.location,
      startedAt: alert.startedAt,
    }));
  return settle(
    ok({
      businessDate: date,
      admissionPeople,
      parkingVehicles,
      pendingAlertCount: openAlerts.length,
      pendingReportCount: run.reports.filter((report) => report.status === "pending").length,
      includedBackground: true as const,
      latestAlerts,
    }),
  );
}

export function businessDateForInput(): string {
  return toDateString(businessNow());
}

export function todayStartMs(): number {
  return fromShanghai(toDateString(businessNow()), "00:00");
}
