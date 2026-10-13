import {api} from './store';
import {sync,captureVersions} from "./store";
import {writeOnline} from "./online-write";
import { businessNow, fromShanghai, isSlotEnded, toDateString } from "../core/time";
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
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

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
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

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
 return writeOnline("adminCancelOrder",[id,input],id=>adminGetOrder(id));
}

export interface RescheduleOrderInput {
  targetSlotId: string;
  note?: string;
  actionId?: string;
  actor?: string;
}

export async function adminRescheduleOrder(id: string, input: RescheduleOrderInput): Promise<ApiResult<OrderView & { unchanged: boolean }>> {
 return writeOnline("adminRescheduleOrder",[id,input],async id=>{const r=await adminGetOrder(id);return r.ok?ok({...r.data,unchanged:false}):r;});
}

export interface SlotQuery {
  date?: string;
  type?: Order["type"] | "all";
  lotId?: string | "all";
}

export async function adminListSlots(query: SlotQuery = {}): Promise<ApiResult<SlotView[]>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const run = getRun();
  if(query.date){
   const kinds=query.type==='all'?['entry','parking']:[query.type==='parking'?'parking':'entry'];
   const fetched:any[]=[];
   for(const kind of kinds)for(const lot of kind==='entry'?['']:query.lotId&&query.lotId!=='all'?[query.lotId]:['p1','p2','p3']){
    const value=await api.request<any>('/admin/booking/slots?date='+query.date+'&kind='+kind+(lot?'&lotId='+lot:''));
    fetched.push(...value.items.map((s:any)=>({id:s.id,date:s.date,type:s.kind==='entry'?'admission':'parking',lotId:s.lotId,start:s.slot,end:s.end,unit:s.kind==='entry'?'person':'vehicle',interactiveQuota:s.capacity,backgroundQuota:0})));
   }
   run.slots=[...run.slots.filter(s=>s.date!==query.date),...fetched];
  }
  const views = buildSlotViews(run.slots, run.orders, run.facilityStates).filter((slot) => {
    if (query.date && slot.date !== query.date) return false;
    if (query.type && query.type !== "all" && slot.type !== query.type) return false;
    if (query.type !== "admission" && query.lotId && query.lotId !== "all" && slot.lotId !== query.lotId) return false;
    return true;
  });
  return settle(ok(views));
}

export interface SaveSlotCapacityInput {
  slotId: string;
  interactiveQuota: number;
}

export async function saveSlotCapacity(input: SaveSlotCapacityInput): Promise<ApiResult<SlotView>> {
 return writeOnline("saveSlotCapacity",[input],async id=>{const r=await adminListSlots();return r.ok?ok(r.data.find(s=>s.id===id)!):r;});
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
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

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
