import {sync,captureVersions} from "./store";
import {writeOnline} from "./online-write";
import { facilityById } from "../core/catalogue";
import { formatDateTime, toDateString } from "../core/time";
import type { OpsAlert, OpsAlertCategory, OpsAlertStatus, OpsSeverity } from "@scenic/contracts";
import { fail, ok, type ApiResult } from "../core/result";
import { getRun, requireStaff } from "./store";
import { matchKeyword, paginate, type ListQuery, type ListResult } from "./list";

async function settle<T>(value: T, ms = 120): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  return value;
}

export const severityLabels: Record<OpsSeverity, string> = {
  reminder: "提醒",
  important: "重要",
  critical: "紧急",
};

export const alertStatusLabels: Record<OpsAlertStatus, string> = {
  pending: "待处理",
  processing: "处理中",
  resolved: "已完成",
};

export const categoryLabels: Record<OpsAlertCategory, string> = {
  crowd: "客流",
  parking: "停车",
  cable: "索道",
  restroom: "卫生间",
  equipment: "设备",
  help: "求助",
  cleaning: "清洁",
  inspection: "检修",
};

export interface AlertQuery extends ListQuery {
  scope?: "current" | "history";
  severity?: OpsSeverity | "all";
  category?: OpsAlertCategory | "all";
  status?: OpsAlertStatus | "all";
  regionId?: string | "all";
  from?: string;
  to?: string;
  keyword?: string;
}

export interface AlertView extends OpsAlert {
  severityLabel: string;
  statusLabel: string;
  categoryLabel: string;
  startedText: string;
  completedAt?: string;
  completedText?: string;
}

export function buildAlertView(alert: OpsAlert): AlertView {
  const completed = [...alert.records].reverse().find((record) => record.kind === "completed");
  return {
    ...alert,
    severityLabel: severityLabels[alert.severity] ?? alert.severity,
    statusLabel: alertStatusLabels[alert.status] ?? alert.status,
    categoryLabel: categoryLabels[alert.category] ?? alert.category,
    startedText: formatDateTime(Date.parse(alert.startedAt)),
    completedAt: completed?.at,
    completedText: completed ? formatDateTime(Date.parse(completed.at)) : undefined,
  };
}

const severityRank: Record<string, number> = { critical: 0, important: 1, reminder: 2 };

export async function listAlerts(query: AlertQuery = {}): Promise<ApiResult<ListResult<AlertView>>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const scope = query.scope ?? "current";
  const run = getRun();
  const fromMs = query.from ? Date.parse(`${query.from}T00:00:00+08:00`) : null;
  const toMs = query.to ? Date.parse(`${query.to}T23:59:59+08:00`) : null;
  const filtered = run.alerts
    .filter((alert) => {
      const inScope = scope === "history" ? alert.status === "resolved" : alert.status === "pending" || alert.status === "processing";
      if (!inScope) return false;
      if (query.severity && query.severity !== "all" && alert.severity !== query.severity) return false;
      if (query.category && query.category !== "all" && alert.category !== query.category) return false;
      if (query.status && query.status !== "all" && alert.status !== query.status) return false;
      if (query.regionId && query.regionId !== "all" && alert.regionId !== query.regionId) return false;
      const started = Date.parse(alert.startedAt);
      if (fromMs !== null && started < fromMs) return false;
      if (toMs !== null && started > toMs) return false;
      return matchKeyword(query.keyword, [alert.title, alert.reason, alert.location]);
    })
    .map(buildAlertView);

  const sorted =
    scope === "history"
      ? filtered.sort((a, b) => {
          const left = Date.parse(a.completedAt ?? a.startedAt);
          const right = Date.parse(b.completedAt ?? b.startedAt);
          return right === left ? a.id.localeCompare(b.id) : right - left;
        })
      : filtered.sort((a, b) => {
          const rank = (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3);
          if (rank !== 0) return rank;
          const left = Date.parse(a.startedAt);
          const right = Date.parse(b.startedAt);
          return right === left ? a.id.localeCompare(b.id) : right - left;
        });

  return settle(ok(paginate(sorted, query)));
}

export interface AlertDetail {
  alert: AlertView;
  facilityName?: string;
  timeline: Array<{ at: string; atText: string; kind: string; actor: string; text: string }>;
}

export async function getAlert(id: string): Promise<ApiResult<AlertDetail>> {
 const synced=await sync();if(!synced.ok)return synced;captureVersions();

  const guard = requireStaff();
  if (!guard.ok) return guard;
  const alert = getRun().alerts.find((item) => item.id === id);
  if (!alert) return settle(fail("NOT_FOUND", "没有找到对应的告警。"));
  const facility = Object.values(facilityById).find((item) => item.sharedId === alert.anchorId);
  return settle(
    ok({
      alert: buildAlertView(alert),
      facilityName: facility?.name,
      timeline: alert.records.map((record) => ({
        at: record.at,
        atText: formatDateTime(Date.parse(record.at)),
        kind: record.kind,
        actor: record.actor,
        text: record.text,
      })),
    }),
  );
}

export function alertBusinessDate(): string {
  return toDateString(Date.parse(alertBusinessTime()));
}

function alertBusinessTime(): string {
  return getRun().businessTime;
}
