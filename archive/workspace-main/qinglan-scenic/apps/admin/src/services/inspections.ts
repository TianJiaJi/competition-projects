import {sync,captureVersions} from "./store";
import {writeOnline} from "./online-write";
import { businessNow, isBusinessDate, toDateString } from "../core/time";
import { facilityById } from "../core/catalogue";
import { LIMITS, checkText, collectErrors, isPositiveInteger } from "../core/validate";
import type { InspectionPlan } from "../core/types";
import { fail, ok, type ApiResult } from "../core/result";
import { getRun, getStore, mutate, requireStaff } from "./store";
import { matchKeyword, paginate, sortByUpdatedDesc, type ListQuery, type ListResult } from "./list";
import { displayName } from "./facilities";

async function settle<T>(value: T, ms = 140): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}

export interface InspectionPlanView extends InspectionPlan {
  facilityName: string;
  category: string;
  dueStatus: "due" | "upcoming" | "disabled";
  relatedAlertCount: number;
}

export interface InspectionQuery extends ListQuery {
  keyword?: string;
  enabled?: boolean | "all";
  due?: "due" | "upcoming" | "all";
}

export async function listInspectionPlans(query: InspectionQuery = {}): Promise<ApiResult<ListResult<InspectionPlanView>>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const store = getStore();
  const run = getRun();
  const today = toDateString(businessNow());
  const views = store.global.inspectionPlans.map((plan) => {
    const facility = facilityById[plan.facilityId];
    const dueStatus: InspectionPlanView["dueStatus"] = !plan.enabled
      ? "disabled"
      : plan.nextDueDate <= today
        ? "due"
        : "upcoming";
    return {
      ...plan,
      facilityName: facility ? displayName(facility, store) : plan.facilityId,
      category: facility?.category ?? "safety",
      dueStatus,
      relatedAlertCount: run.alerts.filter((alert) => alert.category === "inspection" && alert.title.startsWith(facility?.name ?? plan.facilityId)).length,
    };
  });
  const filtered = views.filter((view) => {
    if (typeof query.enabled === "boolean" && view.enabled !== query.enabled) return false;
    if (query.due && query.due !== "all" && view.dueStatus !== query.due) return false;
    return matchKeyword(query.keyword, [view.facilityName, view.facilityId, view.id]);
  });
  return settle(ok(paginate(sortByUpdatedDesc(filtered.map((view) => ({ ...view }))), query)));
}

export interface InspectionPlanInput {
  facilityId: string;
  intervalDays: number;
  nextDueDate: string;
  instructions: string;
  enabled: boolean;
}

function validatePlan(input: InspectionPlanInput, existing?: InspectionPlan) {
  const errors = collectErrors([
    checkText(input.instructions, "instructions", LIMITS.instruction, "检修说明"),
  ]);
  const facility = facilityById[input.facilityId];
  if (!facility) errors.push({ field: "facilityId", message: "请选择已预置的安全设施" });
  else if (facility.category !== "safety") errors.push({ field: "facilityId", message: "检修对象必须是安全设施" });
  if (!isPositiveInteger(input.intervalDays)) errors.push({ field: "intervalDays", message: "周期天数必须是正整数" });
  if (!isBusinessDate(input.nextDueDate)) errors.push({ field: "nextDueDate", message: "下次检修日期必须是合法的上海业务日期" });
  if (existing && existing.facilityId !== input.facilityId) {
    errors.push({ field: "facilityId", message: "已有记录的检修计划不能更换关联设施" });
  }
  return errors;
}

export async function createInspectionPlan(input: InspectionPlanInput): Promise<ApiResult<InspectionPlanView>> {
 const errors=validatePlan(input);if(errors.length)return fail("VALIDATION_ERROR","请检查检修表单",{fieldErrors:errors});
 return writeOnline("createInspectionPlan",[input],async id=>{const r=await listInspectionPlans({pageSize:50});return r.ok?ok(r.data.items.find(p=>p.id===id)!):r;});
}

export async function updateInspectionPlan(planId: string, input: InspectionPlanInput): Promise<ApiResult<InspectionPlanView>> {
 const errors=validatePlan(input);if(errors.length)return fail("VALIDATION_ERROR","请检查检修表单",{fieldErrors:errors});
 return writeOnline("updateInspectionPlan",[planId,input],async id=>{const r=await listInspectionPlans({pageSize:50});return r.ok?ok(r.data.items.find(p=>p.id===id)!):r;});
}

export async function setInspectionPlanEnabled(planId: string, enabled: boolean): Promise<ApiResult<InspectionPlanView>> {
 return writeOnline("setInspectionPlanEnabled",[planId,enabled],async id=>{const r=await listInspectionPlans({pageSize:50});return r.ok?ok(r.data.items.find(p=>p.id===id)!):r;});
}

/** 保存前提示：该计划是否会在本次保存后新增一条检修告警记录。 */
export function willGenerateRecord(plan: { id?: string; enabled: boolean; nextDueDate: string }): boolean {
  if (!plan.enabled) return false;
  if (plan.nextDueDate > toDateString(businessNow())) return false;
  const store = getStore();
  const run = store.runs[store.activeRunId];
  return !run.inspectionRecords.some((record) => record.planId === plan.id && record.dueDate === plan.nextDueDate);
}
