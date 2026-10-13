import type {OpsAlert,OpsSeverity,OpsAlertStatus,OpsAlertCategory} from '@scenic/contracts';
export const severityLabels: Record<OpsSeverity, string> = {
  reminder: "提醒",
  important: "重要",
  critical: "紧急",
};
export const statusLabels: Record<OpsAlertStatus, string> = {
  pending: "待处理",
  processing: "处理中",
  resolved: "已处理",
};
export const categoryLabels: Record<OpsAlertCategory, string> = {
  crowd: "客流拥堵",
  parking: "停车紧张",
  cable: "索道排队",
  restroom: "卫生间异常",
  equipment: "设施故障",
  help: "游客求助",
  cleaning: "环境保洁",
  inspection: "定期检修",
};
export const severityRank: Record<OpsSeverity, number> = {
  critical: 0,
  important: 1,
  reminder: 2,
};
export function sortAlerts(alerts: OpsAlert[]) {
  return [...alerts].sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      b.startedAt.localeCompare(a.startedAt) ||
      a.id.localeCompare(b.id),
  );
}
export function groupAlerts(alerts: OpsAlert[]) {
  const groups = new Map<string, OpsAlert[]>();
  for (const a of sortAlerts(alerts)) {
    const group = groups.get(a.anchorId) ?? [];
    group.push(a);
    groups.set(a.anchorId, group);
  }
  return [...groups].map(([anchorId, items]) => ({
    anchorId,
    items,
    severity: items[0].severity,
  }));
}
