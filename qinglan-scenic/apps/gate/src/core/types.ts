import type {
  OpsAlert,
  OpsAlertCategory,
  OpsAlertStatus,
  OpsSeverity,
} from "@scenic/contracts";
import type { WorkStatus } from "../../../../packages/contracts/src/platform";
export type { OpsAlertCategory, OpsAlertStatus, OpsSeverity };
export interface Employee {
  id: string;
  name: string;
}
export interface Session {
  employee: Employee;
  expiresAt: number;
}
/** startedAt remains the occurrence time from OpsAlert; never reinterpret it. */
export interface Task extends OpsAlert {
  runId: string;
  version: number;
  assignee: Employee | null;
  handlingStartedAt: string | null;
  completedAt: string | null;
  workOrderStatus?: WorkStatus;
}
export type OAType = "reinforcement" | "cordon" | "supplies" | "other";
export type OAStatus = "pending" | "approved" | "rejected" | "withdrawn";
export interface OARecord {
  kind: "submitted" | "approved" | "rejected" | "withdrawn";
  at: string;
  actor: Employee;
  text: string;
}
export interface OARequest {
  id: string;
  runId: string;
  taskId: string;
  taskTitle: string;
  type: OAType;
  reason: string;
  needs: string;
  status: OAStatus;
  applicant: Employee;
  createdAt: string;
  updatedAt: string;
  version: number;
  decision: { actor: Employee; at: string; opinion: string } | null;
  records: OARecord[];
}
export interface Command {
  key: string;
  expectedVersion: number;
}
export interface StoredCommand {
  fingerprint: string;
  resultId: string;
}
export interface Database {
  schemaVersion: 1;
  runId: string;
  revision: number;
  tasks: Task[];
  requests: OARequest[];
  createdRequestId?: string;
  commands: Record<string, StoredCommand>;
}
export const categoryLabels: Record<OpsAlertCategory, string> = {
  crowd: "客流",
  parking: "停车",
  cable: "索道",
  restroom: "卫生间",
  equipment: "设备",
  help: "求助",
  cleaning: "保洁",
  inspection: "检修",
};
export const severityLabels: Record<OpsSeverity, string> = {
  critical: "紧急",
  important: "重要",
  reminder: "提醒",
};
export const statusLabels: Record<OpsAlertStatus, string> = {
  pending: "待处理",
  processing: "处理中",
  resolved: "已处理",
};
export const oaTypeLabels: Record<OAType, string> = {
  reinforcement: "增援",
  cordon: "封锁现场",
  supplies: "物资",
  other: "其他",
};
export const oaStatusLabels: Record<OAStatus, string> = {
  pending: "待审批",
  approved: "已批准",
  rejected: "已驳回",
  withdrawn: "已撤回",
};
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function displayTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
export function businessDate(value: string): string {
  const d = new Date(new Date(value).getTime() + 8 * 3600000);
  return d.toISOString().slice(0, 10);
}
export interface TaskFilter {
  scope: "current" | "mine" | "history";
  actorId: string;
  keyword: string;
  status: string;
  category: string;
  from: string;
  to: string;
}
export function filterTasks(tasks: Task[], f: TaskFilter): Task[] {
  const weight = { critical: 0, important: 1, reminder: 2 };
  return tasks
    .filter((t) =>
      f.scope === "mine"
        ? t.assignee?.id === f.actorId
        : f.scope === "history"
          ? t.status === "resolved"
          : t.status !== "resolved",
    )
    .filter(
      (t) =>
        (!f.status || t.status === f.status) &&
        (!f.category || t.category === f.category),
    )
    .filter((t) =>
      `${t.title} ${t.reason} ${t.location}`.includes(f.keyword.trim()),
    )
    .filter((t) => {
      const date = businessDate(
        f.scope === "history" ? t.completedAt! : t.startedAt,
      );
      return (!f.from || date >= f.from) && (!f.to || date <= f.to);
    })
    .sort((a, b) =>
      f.scope === "history"
        ? b.completedAt!.localeCompare(a.completedAt!) ||
          a.id.localeCompare(b.id)
        : weight[a.severity] - weight[b.severity] ||
          b.startedAt.localeCompare(a.startedAt) ||
          a.id.localeCompare(b.id),
    );
}
