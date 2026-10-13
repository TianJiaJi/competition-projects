import { businessNow, toDateString, toIsoString } from "./time";
import { facilityById } from "../../src/core/catalogue";
import type { BusinessStore, InspectionRecord } from "../../src/core/types";

export interface GenerationOutcome {
  created: number;
  alertIds: string[];
}

/**
 * 需求文档 §4.4：到期判断为 enabled 且 nextDueDate 不晚于固定业务日期，
 * 去重键为 (runId, planId, nextDueDate)，计划与生成记录、告警在同一次持久化中保存。
 */
export function applyInspectionGeneration(
  draft: BusinessStore,
  runId: string,
  now = businessNow(),
): GenerationOutcome {
  const run = draft.runs[runId];
  if (!run) return { created: 0, alertIds: [] };
  const businessDate = toDateString(now);
  const alertIds: string[] = [];
  for (const plan of draft.global.inspectionPlans) {
    if (!plan.enabled) continue;
    if (plan.nextDueDate > businessDate) continue;
    const exists = run.inspectionRecords.some(
      (record) => record.planId === plan.id && record.dueDate === plan.nextDueDate,
    );
    if (exists) continue;
    const facility = facilityById[plan.facilityId];
    const name = facility?.name ?? plan.facilityId;
    const alertId = `alert-inspection-${plan.id}-${plan.nextDueDate}`;
    const record: InspectionRecord = {
      id: `inspection-record-${plan.id}-${plan.nextDueDate}`,
      runId,
      planId: plan.id,
      facilityId: plan.facilityId,
      dueDate: plan.nextDueDate,
      alertId,
      at: now,
    };
    run.inspectionRecords.push(record);
    run.alerts.push({
      id: alertId,
      anchorId: facility?.sharedId ?? plan.facilityId,
      regionId: facility?.regionId ?? "",
      category: "inspection",
      severity: "reminder",
      status: "pending",
      title: `${name}定期检修`,
      location: facility ? `${facility.regionName} · ${name}` : name,
      reason: `检修周期 ${plan.intervalDays} 天，到期日 ${plan.nextDueDate}`,
      metric: plan.instructions,
      startedAt: toIsoString(now),
      records: [
        { at: toIsoString(now), kind: "created", actor: "检修计划", text: "到期自动生成待处理检修告警" },
      ],
    });
    alertIds.push(alertId);
  }
  if (alertIds.length) {
    run.revision += 1;
    draft.revision += 1;
  }
  return { created: alertIds.length, alertIds };
}
