import type { BusinessStore } from "./types";

// 存储是外部输入：递归检查页面和初始化依赖的字段，不能只验证顶层数组。
// 这里只检查结构，卫生间守恒等业务异常仍交给对应页面呈现。
type Rule = (value: unknown) => boolean;
const string: Rule = (value) => typeof value === "string";
const number: Rule = (value) => typeof value === "number" && Number.isFinite(value);
const boolean: Rule = (value) => typeof value === "boolean";
const counter: Rule = (value) => number(value) && Number.isSafeInteger(value) && (value as number) >= 0;
const optional = (rule: Rule): Rule => (value) => value === undefined || rule(value);
const oneOf = (...values: string[]): Rule => (value) => typeof value === "string" && values.includes(value);
const array = (rule: Rule): Rule => (value) => Array.isArray(value) && value.every(rule);
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const shape = (fields: Record<string, Rule>): Rule => (value) =>
  isRecord(value) && Object.entries(fields).every(([key, rule]) => rule(value[key]));
const dictionary = (rule: Rule): Rule => (value) => isRecord(value) && Object.values(value).every(rule);
const strings = array(string);
const timestamps = { createdAt: number, updatedAt: number };
const partNumbers = shape({ female: number, male: number, maleUrinals: number, accessible: number });
const state = oneOf("open", "maintenance", "closed", "unknown");
const orderType = oneOf("admission", "parking");
const source = oneOf("onsite", "background");

const globalData = shape({
  users: array(shape({ id: string, nickname: string, identity: oneOf("visitor", "staff"), createdAt: string, disabled: boolean })),
  scenic: shape({ name: string, summary: string, address: string, servicePhone: string, coverUrl: string, openingText: string, updatedAt: number }),
  articles: array(shape({
    id: string, category: oneOf("news", "guide"), title: string, summary: string, body: string,
    coverUrl: string, published: boolean, revision: counter, ...timestamps,
  })),
  poiOverrides: dictionary(shape({
    poiId: string, name: string, summary: string, body: string, imageUrls: strings, sourceIds: strings, updatedAt: number,
  })),
  knowledge: array(shape({
    id: string, title: string, body: string, poiId: optional(string), keywords: strings,
    sourceId: string, version: string, retrievalStatus: oneOf("ready", "disabled"),
  })),
  sources: array(shape({ id: string, title: string, publisher: string, url: optional(string), publishedAt: optional(string) })),
  inspectionPlans: array(shape({
    id: string, facilityId: string, intervalDays: number, nextDueDate: string, instructions: string, enabled: boolean, ...timestamps,
  })),
  nextArticleSeq: counter, nextPlanSeq: counter, revision: counter,
});

const order = shape({
  id: string, type: orderType, slotDate: string, slotStart: string, slotEnd: string, source,
  batchId: optional(string), contactName: optional(string), contactPhone: optional(string),
  people: optional(number), vehicles: optional(number), plate: optional(string),
  parkingLotId: optional(string), actualParkingLotId: optional(string),
  reservationStatus: oneOf("confirmed", "cancelled", "expired"),
  visitStatus: oneOf("not_entered", "in_park", "exited"), parkingStatus: oneOf("not_arrived", "waiting", "parked", "departed"),
  invalidReason: optional(string), ...timestamps,
  enteredAt: optional(number), exitedAt: optional(number), arrivedAt: optional(number), departedAt: optional(number),
  history: array(shape({ at: number, actor: string, action: oneOf("cancel", "reschedule"), fromSlot: string, toSlot: string, note: string })),
});
const baseline = shape({ occupied: number, queue: number, baselinePaused: number });
const runData = shape({
  runId: string, businessTime: string,
  orders: array(order),
  slots: array(shape({
    id: string, date: string, type: orderType, lotId: optional(string), start: string, end: string,
    unit: oneOf("person", "vehicle"), interactiveQuota: number, backgroundQuota: number,
  })),
  notices: array(shape({
    id: string, title: string, body: string, audience: oneOf("public", "internal"), published: boolean,
    startsAt: string, endsAt: string, ...timestamps,
  })),
  facilityStates: dictionary(shape({ facilityId: string, state, reason: optional(string), updatedAt: number })),
  restroomAdjustments: dictionary(shape({
    facilityId: string, state: oneOf("open", "maintenance", "closed"), reason: optional(string), requested: partNumbers, updatedAt: number,
  })),
  restroomBaselines: dictionary(shape({ female: baseline, male: baseline, maleUrinals: baseline, accessible: baseline })),
  parkingStats: dictionary(shape({ capacity: number, occupied: number })),
  cableStats: shape({ queueCount: number, inTransit: number }),
  alerts: array(shape({
    id: string, anchorId: string, regionId: string,
    category: oneOf("crowd", "parking", "cable", "restroom", "equipment", "help", "cleaning", "inspection"),
    severity: oneOf("reminder", "important", "critical"), status: oneOf("pending", "processing", "resolved"),
    title: string, location: string, reason: string, metric: string, startedAt: string, previousAlertId: optional(string),
    records: array(shape({ at: string, kind: oneOf("created", "started", "completed"), actor: string, text: string })),
  })),
  inspectionRecords: array(shape({ id: string, runId: string, planId: string, facilityId: string, dueDate: string, alertId: string, at: number })),
  chatRooms: array(shape({ id: string, name: string, kind: oneOf("park", "poi"), poiId: optional(string) })),
  messages: array(shape({
    id: string, roomId: string, authorId: string, authorNickname: string, source, body: string, at: number,
    removed: boolean, removedAt: optional(number), removedBy: optional(string),
  })),
  reports: array(shape({
    id: string, roomId: string, messageId: string, reporterNickname: string, reason: oneOf("spam", "abuse", "other"),
    status: oneOf("pending", "resolved", "dismissed"), note: optional(string), handledAt: optional(number), handledBy: optional(string), createdAt: number,
  })),
  mutes: array(shape({ userId: string, nickname: string, minutes: number, until: number, reason: string, setAt: number, scope: oneOf("all") })),
  actionLog: dictionary(shape({ at: number, result: oneOf("ok", "failed"), label: string })),
  nextOrderSeq: counter, nextNoticeSeq: counter, nextReportSeq: counter, nextMessageSeq: counter, revision: counter,
});

export function isValidBusinessStore(value: unknown, version: number): value is BusinessStore {
  if (!isRecord(value) || value.version !== version || !counter(value.revision) || !string(value.activeRunId)) return false;
  if (!globalData(value.global) || !dictionary(runData)(value.runs)) return false;
  const runs = value.runs as Record<string, { runId: string }>;
  return Object.hasOwn(runs, value.activeRunId as string)
    && Object.entries(runs).every(([id, run]) => run.runId === id);
}
