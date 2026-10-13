import {rawWorkspace,sync,captureVersions} from "./store";
import {writeOnline} from "./online-write";
import { cableConfig, restroomCapacities, restroomDefinitions, pointById } from "@scenic/scenic";
import { facilityById, buildPathCheckpoints, facilities } from "../core/catalogue";
import { evaluateReturnPaths, type PathCheckResult } from "../core/paths";
import { computeRestroomMetrics, type RestroomMetrics, type RestroomState } from "../core/restroom";
import { businessNow, toIsoString } from "../core/time";
import { LIMITS, checkText, collectErrors, isNonNegativeInteger } from "../core/validate";
import type {
  BusinessStore,
  Facility,
  FacilityState,
  FacilityStateRecord,
  PartBaselineSample,
  RestroomPartKey,
  RestroomAdjustment,
  RunData,
} from "../core/types";
import { RESTROOM_PART_KEYS, facilityStateLabels } from "../core/types";
import { fail, ok, type ApiResult } from "../core/result";
import { getRun, getStore, mutate, requireStaff } from "./store";
import { matchKeyword } from "./list";

async function settle<T>(value: T, ms = 140): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}

export interface FacilityView extends Facility {
  state: FacilityState;
  stateReason?: string;
  stateUpdatedAt: number;
  metrics: Array<{ label: string; value: string }>;
  relatedAlertCount: number;
  activePlanCount: number;
}

export interface FacilityQuery {
  category?: Facility["category"] | "all";
  regionId?: string | "all";
  state?: FacilityState | "all";
  keyword?: string;
}

export function facilityStateOf(run: RunData, facilityId: string): FacilityStateRecord {
  return (
    run.facilityStates[facilityId] ?? {
      facilityId,
      state: "unknown",
      updatedAt: businessNow(),
    }
  );
}

export function displayName(facility: Facility, store: BusinessStore): string {
  const override = store.global.poiOverrides[facility.id];
  return override?.name ?? facility.name;
}

function relatedAlerts(run: RunData, facility: Facility) {
  return run.alerts.filter((alert) => alert.anchorId === facility.sharedId);
}

function facilityMetrics(facility: Facility, run: RunData, store: BusinessStore): Array<{ label: string; value: string }> {
  const metrics = [...facility.readonly];
  if (facility.category === "parking") {
    const stats = run.parkingStats[facility.id];
    const confirmed = run.orders.filter(
      (order) => order.type === "parking" && order.parkingLotId === facility.id && order.reservationStatus === "confirmed",
    ).length;
    if (stats) {
      metrics.push(
        { label: "总容量", value: `${stats.capacity} 辆` },
        { label: "当前占用", value: `${stats.occupied} 辆` },
        { label: "物理余位", value: `${Math.max(0, stats.capacity - stats.occupied)} 辆` },
        { label: "可接收新预约", value: facilityStateOf(run, facility.id).state === "open" ? "可以" : "不可用" },
        { label: "关联有效预约", value: `${confirmed} 单` },
      );
    }
  }
  if (facility.category === "toilet" && run.restroomBaselines[facility.id]) {
    const detail = restroomDetailOf(facility.id, store, run);
    metrics.push(
      { label: "使用中服务位", value: `${detail.totals.occupied} 位` },
      { label: "实际暂停", value: `${detail.totals.effectivePaused} 位` },
      { label: "等待释放", value: `${detail.totals.pendingRelease} 位` },
      { label: "可用服务位", value: `${detail.totals.available} 位` },
      { label: "排队人数", value: `${detail.totals.queue} 人` },
    );
  }
  if (facility.category === "cable") {
    metrics.push(
      { label: "分方向排队", value: `${run.cableStats.queueCount} 人（上行 ${rawWorkspace()?.snapshot.public.points.lower?.cable?.queueCount ?? "—"}／下行 ${rawWorkspace()?.snapshot.public.points.upper?.cable?.queueCount ?? "—"}）` },
      { label: "在途人数", value: `${run.cableStats.inTransit} 人` },
      { label: "高峰期运力", value: `${cableConfig.capacityPerMinute} 人／分钟` },
    );
  }
  if (facility.category === "safety" || facility.category === "attraction") {
    const plans = store.global.inspectionPlans.filter((plan) => plan.facilityId === facility.id);
    metrics.push(
      { label: "关联检修计划", value: plans.length ? `${plans.filter((plan) => plan.enabled).length} 份启用 / 共 ${plans.length} 份` : "暂无" },
      { label: "关联告警", value: `${relatedAlerts(run, facility).length} 条` },
    );
  }
  return metrics;
}

export function buildFacilityView(facility: Facility, store: BusinessStore, run: RunData): FacilityView {
  const record = facilityStateOf(run, facility.id);
  return {
    ...facility,
    name: displayName(facility, store),
    state: record.state,
    stateReason: record.reason,
    stateUpdatedAt: record.updatedAt,
    metrics: facilityMetrics(facility, run, store),
    relatedAlertCount: relatedAlerts(run, facility).length,
    activePlanCount: store.global.inspectionPlans.filter((plan) => plan.facilityId === facility.id && plan.enabled).length,
  };
}

export async function listFacilities(query: FacilityQuery = {}): Promise<ApiResult<FacilityView[]>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const store = getStore();
  const run = getRun();
  const views = facilities
    .filter((facility) => {
      if (query.category && query.category !== "all" && facility.category !== query.category) return false;
      if (query.regionId && query.regionId !== "all" && facility.regionId !== query.regionId) return false;
      const record = facilityStateOf(run, facility.id);
      if (query.state && query.state !== "all" && record.state !== query.state) return false;
      return matchKeyword(query.keyword, [displayName(facility, store), facility.id]);
    })
    .map((facility) => buildFacilityView(facility, store, run));
  return settle(ok(views));
}

export interface FacilityDetail {
  facility: FacilityView;
  relatedAlerts: Array<{ id: string; title: string; severity: string; status: string; location: string }>;
  plans: Array<{ id: string; intervalDays: number; nextDueDate: string; enabled: boolean }>;
  restroom?: RestroomMetrics & { state: RestroomState; reason?: string; updatedAt: number; requested: Record<RestroomPartKey, number> };
  pathCheck?: PathCheckResult;
}

export async function getFacility(id: string): Promise<ApiResult<FacilityDetail>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const facility = facilityById[id];
  if (!facility) return settle(fail("NOT_FOUND", "没有找到对应的设施。"));
  const store = getStore();
  const run = getRun();
  const detail: FacilityDetail = {
    facility: buildFacilityView(facility, store, run),
    relatedAlerts: relatedAlerts(run, facility).map((alert) => ({
      id: alert.id,
      title: alert.title,
      severity: alert.severity,
      status: alert.status,
      location: alert.location,
    })),
    plans: store.global.inspectionPlans
      .filter((plan) => plan.facilityId === facility.id)
      .map((plan) => ({ id: plan.id, intervalDays: plan.intervalDays, nextDueDate: plan.nextDueDate, enabled: plan.enabled })),
  };
  if (facility.category === "toilet" && run.restroomBaselines[facility.id]) {
    const detailRestroom = restroomDetailOf(facility.id, store, run);
    detail.restroom = {
      ...detailRestroom,
      state: restroomStateOf(run, facility.id),
      reason: run.restroomAdjustments[facility.id]?.reason,
      updatedAt: run.restroomAdjustments[facility.id]?.updatedAt ?? businessNow(),
      requested: requestedOf(run, facility.id),
    };
  }
  if (facility.category === "road" || facility.category === "entrance" || facility.category === "cable") {
    detail.pathCheck = pathCheckFor(run, run.facilityStates);
  }
  return settle(ok(detail));
}

function restroomStateOf(run: RunData, facilityId: string): RestroomState {
  const adjustment = run.restroomAdjustments[facilityId];
  if (adjustment?.state) return adjustment.state;
  const state = facilityStateOf(run, facilityId).state;
  return state === "maintenance" ? "maintenance" : state === "closed" ? "closed" : "open";
}

function requestedOf(run: RunData, facilityId: string): Record<RestroomPartKey, number> {
  const adjustment = run.restroomAdjustments[facilityId];
  return adjustment?.requested ?? { female: 0, male: 0, maleUrinals: 0, accessible: 0 };
}

export function restroomDetailOf(facilityId: string, store: BusinessStore, run: RunData): RestroomMetrics {
  const definition = restroomDefinitions.find((item) => item.id === facilityId);
  const capacity = restroomCapacities[(definition?.size ?? "small") as "large" | "small"];
  const baselines = run.restroomBaselines[facilityId] ?? emptyBaselines();
  return computeRestroomMetrics(
    { ...capacity },
    baselines,
    restroomStateOf(run, facilityId),
    requestedOf(run, facilityId),
  );
}

function emptyBaselines(): Record<RestroomPartKey, PartBaselineSample> {
  return Object.fromEntries(
    RESTROOM_PART_KEYS.map((key) => [key, { occupied: 0, queue: 0, baselinePaused: 0 }]),
  ) as Record<RestroomPartKey, PartBaselineSample>;
}

export function pathCheckFor(run: RunData, facilityStates: Record<string, FacilityStateRecord>): PathCheckResult {
  const checkpoints = buildPathCheckpoints({
    facilityStates,
    parkingStats: run.parkingStats,
    restroomBaselines: run.restroomBaselines,
  });
  const closedRoadIds = facilities
    .filter((facility) => facility.category === "road")
    .filter((facility) => (facilityStates[facility.id]?.state ?? "unknown") === "closed")
    .map((facility) => facility.id);
  const closedFacilityIds = facilities
    .filter((facility) => (facilityStates[facility.id]?.state ?? "unknown") !== "open")
    .map((facility) => facility.id);
  return evaluateReturnPaths({
    checkpointNodes: checkpoints.checkpointNodes,
    checkpointLabels: checkpoints.checkpointLabels,
    closedRoadIds,
    closedFacilityIds,
  });
}

export interface FacilityStateInput {
  state: FacilityState;
  reason?: string;
}

export async function updateFacilityState(id: string, input: FacilityStateInput): Promise<ApiResult<FacilityView>> {
 return writeOnline("updateFacilityState",[id,input],async id=>{const r=await getFacility(id);return r.ok?ok(r.data.facility):r;});
}

export interface RestroomAdjustmentInput {
  state: RestroomState;
  reason?: string;
  requested: Record<RestroomPartKey, number>;
}

export async function getRestroomAdjustment(facilityId: string): Promise<ApiResult<FacilityDetail>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  return getFacility(facilityId);
}

export async function saveRestroomAdjustment(
  facilityId: string,
  input: RestroomAdjustmentInput,
): Promise<ApiResult<FacilityDetail>> {
 return writeOnline("saveRestroomAdjustment",[facilityId,input],id=>getFacility(id));
}

export function facilityStateLabel(state: FacilityState): string {
  return facilityStateLabels[state];
}

/** 检修计划的设施下拉：仅 15 处预置安全设施。 */
export async function listSafetyFacilityOptions(): Promise<ApiResult<Array<{ id: string; name: string }>>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const store = getStore();
  const options = facilities
    .filter((facility) => facility.category === "safety")
    .map((facility) => ({ id: facility.id, name: displayName(facility, store) }));
  return settle(ok(options));
}

export function facilityIsoNow(): string {
  return toIsoString(businessNow());
}

export function pointName(id: string): string {
  return pointById[id]?.name ?? id;
}
