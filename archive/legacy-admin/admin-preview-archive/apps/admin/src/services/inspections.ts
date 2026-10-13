import { businessNow, isBusinessDate, toDateString } from "../core/time";
import { applyInspectionGeneration } from "../mock/inspection-generation";
import { facilityById } from "../mock/catalogue";
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
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const errors = validatePlan(input);
  if (errors.length) return settle(fail("VALIDATION_ERROR", "检修计划校验未通过。", { fieldErrors: errors }));
  return settle(
    mutate("createInspectionPlan", (draft) => {
      const conflict = draft.global.inspectionPlans.some(
        (plan) => plan.facilityId === input.facilityId && plan.enabled && input.enabled,
      );
      if (conflict) {
        return fail("INSPECTION_PLAN_CONFLICT", "同一设施只能有一份启用中的检修计划。", {
          details: [facilityById[input.facilityId]?.name ?? input.facilityId],
        });
      }
      const seq = draft.global.nextPlanSeq;
      draft.global.nextPlanSeq += 1;
      const now = businessNow();
      const plan: InspectionPlan = {
        id: `plan-${String(seq).padStart(3, "0")}`,
        facilityId: input.facilityId,
        intervalDays: input.intervalDays,
        nextDueDate: input.nextDueDate,
        instructions: input.instructions.trim(),
        enabled: input.enabled,
        createdAt: now,
        updatedAt: now,
      };
      draft.global.inspectionPlans.push(plan);
      applyInspectionGeneration(draft, draft.activeRunId);
      const facility = facilityById[plan.facilityId];
      return ok({
        ...plan,
        facilityName: facility ? displayName(facility, draft) : plan.facilityId,
        category: facility?.category ?? "safety",
        dueStatus: plan.enabled ? (plan.nextDueDate <= toDateString(now) ? "due" : "upcoming") : "disabled",
        relatedAlertCount: draft.runs[draft.activeRunId].inspectionRecords.filter((record) => record.planId === plan.id).length,
      } satisfies InspectionPlanView);
    }),
  );
}

export async function updateInspectionPlan(planId: string, input: InspectionPlanInput): Promise<ApiResult<InspectionPlanView>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const existing = getStore().global.inspectionPlans.find((plan) => plan.id === planId);
  if (!existing) return settle(fail("NOT_FOUND", "没有找到对应的检修计划。"));
  const errors = validatePlan(input, existing);
  if (errors.length) return settle(fail("VALIDATION_ERROR", "检修计划校验未通过。", { fieldErrors: errors }));
  return settle(
    mutate("updateInspectionPlan", (draft) => {
      const plan = draft.global.inspectionPlans.find((item) => item.id === planId);
      if (!plan) return fail("NOT_FOUND", "没有找到对应的检修计划。");
      const conflict = draft.global.inspectionPlans.some(
        (item) => item.id !== planId && item.facilityId === input.facilityId && item.enabled && input.enabled,
      );
      if (conflict) {
        return fail("INSPECTION_PLAN_CONFLICT", "同一设施只能有一份启用中的检修计划。", {
          details: [facilityById[input.facilityId]?.name ?? input.facilityId],
        });
      }
      const dateChanged = plan.nextDueDate !== input.nextDueDate;
      plan.intervalDays = input.intervalDays;      plan.nextDueDate = input.nextDueDate;
      plan.instructions = input.instructions.trim();
      plan.enabled = input.enabled;
      plan.updatedAt = businessNow();
      applyInspectionGeneration(draft, draft.activeRunId);
      const facility = facilityById[plan.facilityId];
      void dateChanged;
      return ok({
        ...plan,
        facilityName: facility ? displayName(facility, draft) : plan.facilityId,
        category: facility?.category ?? "safety",
        dueStatus: plan.enabled ? (plan.nextDueDate <= toDateString(businessNow()) ? "due" : "upcoming") : "disabled",
        relatedAlertCount: draft.runs[draft.activeRunId].inspectionRecords.filter((record) => record.planId === plan.id).length,
      } satisfies InspectionPlanView);
    }),
  );
}

export async function setInspectionPlanEnabled(planId: string, enabled: boolean): Promise<ApiResult<InspectionPlanView>> {
  const guard = requireStaff();
  if (!guard.ok) return guard;
  const existing = getStore().global.inspectionPlans.find((plan) => plan.id === planId);
  if (!existing) return settle(fail("NOT_FOUND", "没有找到对应的检修计划。"));
  return settle(
    mutate("setInspectionPlanEnabled", (draft) => {
      const plan = draft.global.inspectionPlans.find((item) => item.id === planId);
      if (!plan) return fail("NOT_FOUND", "没有找到对应的检修计划。");
      if (enabled) {
        const conflict = draft.global.inspectionPlans.some(
          (item) => item.id !== planId && item.facilityId === plan.facilityId && item.enabled,
        );
        if (conflict) {
          return fail("INSPECTION_PLAN_CONFLICT", "同一设施只能有一份启用中的检修计划。", {
            details: [facilityById[plan.facilityId]?.name ?? plan.facilityId],
          });
        }
      }
      plan.enabled = enabled;
      plan.updatedAt = businessNow();
      applyInspectionGeneration(draft, draft.activeRunId);
      const facility = facilityById[plan.facilityId];
      return ok({
        ...plan,
        facilityName: facility ? displayName(facility, draft) : plan.facilityId,
        category: facility?.category ?? "safety",
        dueStatus: plan.enabled ? (plan.nextDueDate <= toDateString(businessNow()) ? "due" : "upcoming") : "disabled",
        relatedAlertCount: draft.runs[draft.activeRunId].inspectionRecords.filter((record) => record.planId === plan.id).length,
      } satisfies InspectionPlanView);
    }),
  );
}

/** 保存前提示：该计划是否会在本次保存后新增一条检修告警记录。 */
export function willGenerateRecord(plan: { id?: string; enabled: boolean; nextDueDate: string }): boolean {
  if (!plan.enabled) return false;
  if (plan.nextDueDate > toDateString(businessNow())) return false;
  const store = getStore();
  const run = store.runs[store.activeRunId];
  return !run.inspectionRecords.some((record) => record.planId === plan.id && record.dueDate === plan.nextDueDate);
}
