import type { OpsAlertStatus, OpsSeverity } from "@scenic/contracts";
import { businessNow, formatDateTime, noticeStateLabels, type NoticeEffectiveState } from "../core/time";
import type { FacilityState, Order, ReservationStatus } from "../core/types";

export function businessTimeLabel(ms = businessNow()): string {
  return formatDateTime(ms);
}

export function dateTimeText(ms: number | undefined): string {
  return ms ? formatDateTime(ms) : "—";
}

export type TagTone = "neutral" | "success" | "warning" | "danger" | "info";

export function reservationTone(status: ReservationStatus): TagTone {
  if (status === "confirmed") return "success";
  if (status === "cancelled") return "warning";
  return "neutral";
}

export function facilityTone(state: FacilityState): TagTone {
  if (state === "open") return "success";
  if (state === "maintenance") return "warning";
  if (state === "closed") return "danger";
  return "neutral";
}

export function severityTone(severity: OpsSeverity): TagTone {
  if (severity === "critical") return "danger";
  if (severity === "important") return "warning";
  return "info";
}

export function alertStatusTone(status: OpsAlertStatus): TagTone {
  if (status === "pending") return "danger";
  if (status === "processing") return "warning";
  return "success";
}

export function noticeTone(state: NoticeEffectiveState): TagTone {
  if (state === "active") return "success";
  if (state === "pending") return "warning";
  if (state === "expired") return "neutral";
  return "info";
}

export function noticeStateText(state: NoticeEffectiveState): string {
  return noticeStateLabels[state];
}

export function orderAmountText(order: Order): string {
  if (order.type === "admission") return order.people ? `${order.people} 人` : "—";
  return order.vehicles ? `${order.vehicles} 辆` : "—";
}

export function orderSourceText(order: Order): string {
  return order.source === "background" ? "批次预约" : "现场";
}

export function contactText(order: Order): string {
  if (order.source === "background") return "不适用";
  if (!order.contactName && !order.contactPhone) return "未登记";
  return `${order.contactName ?? "未登记"}${order.contactPhone ? ` · ${order.contactPhone}` : ""}`;
}

export function fulfillmentText(order: Order, visitLabels: Record<string, string>, parkingLabels: Record<string, string>): string {
  return order.type === "admission"
    ? visitLabels[order.visitStatus] ?? order.visitStatus
    : parkingLabels[order.parkingStatus] ?? order.parkingStatus;
}

export function valueOrDash(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}
