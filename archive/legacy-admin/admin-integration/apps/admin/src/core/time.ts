/**
 * 后台统一时间口径：业务时间固定，会话与禁言到期用真实时钟。
 * 上海业务时间使用固定 +08:00 偏移，不实现时区数据库。
 */
export const OFFSET_MINUTES = 480;
export const BUSINESS_ISO = "2026-09-12T14:30:00+08:00";
export const BUSINESS_TIME_MS = Date.parse(BUSINESS_ISO);
export const DEFAULT_RUN_ID = "run_admin_mock_20260912";
export const SLOT_FIRST_HOUR = 8;
export const SLOT_LAST_HOUR = 17;
export const BUSINESS_DATE = "2026-09-12";

const pad = (value: number) => String(value).padStart(2, "0");
const shifted = (ms: number) => new Date(ms + OFFSET_MINUTES * 60_000);

/** 固定业务时间的毫秒值；offsetMs 用于开发预览的确定时点。 */
export function businessNow(offsetMs = 0): number {
  return BUSINESS_TIME_MS + offsetMs;
}

/** 真实时钟，仅用于会话到期与禁言到期。 */
export function realNow(): number {
  return Date.now();
}

export function toDateString(ms: number): string {
  const date = shifted(ms);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function toTimeString(ms: number): string {
  const date = shifted(ms);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export function fromShanghai(dateString: string, timeString: string): number {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = timeString.split(":").map(Number);
  return Date.UTC(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0) - OFFSET_MINUTES * 60_000;
}

export function addDays(dateString: string, days: number): string {
  return toDateString(fromShanghai(dateString, "12:00") + days * 86_400_000);
}

export function formatDateTime(ms: number): string {
  return `${toDateString(ms)} ${toTimeString(ms)}`;
}

export function formatDate(ms: number): string {
  return toDateString(ms);
}

/** 上海业务时间的 ISO 字符串，用于告警等共享类型字段。 */
export function toIsoString(ms: number, seconds = 0): string {
  const date = shifted(ms);
  return `${toDateString(ms)}T${toTimeString(ms)}:${String(seconds).padStart(2, "0")}+08:00`;
}

export function parseDateString(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = fromShanghai(value, "00:00");
  return Number.isFinite(ms) && toDateString(ms) === value ? ms : null;
}

export function isBusinessDate(value: string): boolean {
  return parseDateString(value) !== null;
}

/** 解析上海业务时间的控件值：'YYYY-MM-DDTHH:mm' 或 'YYYY-MM-DD HH:mm'。 */
export function parseWallClock(value: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec((value ?? "").trim());
  if (!match) return null;
  const ms = fromShanghai(match[1], `${match[2]}:${match[3]}`);
  return Number.isFinite(ms) && toDateString(ms) === match[1] && toTimeString(ms) === `${match[2]}:${match[3]}` ? ms : null;
}

/** 把毫秒值格式化为控件可用的上海业务时间值。 */
export function toWallClockValue(ms: number): string {
  return `${toDateString(ms)}T${toTimeString(ms)}`;
}

export interface SlotLike {
  date: string;
  start: string;
  end: string;
}

export function slotStartMs(slot: SlotLike): number {
  return fromShanghai(slot.date, slot.start);
}

export function slotEndMs(slot: SlotLike): number {
  return fromShanghai(slot.date, slot.end);
}

/** 已结束档：结束时间不晚于当前业务时间。 */
export function isSlotEnded(slot: SlotLike, now = businessNow()): { ended: boolean; started: boolean } {
  return { ended: slotEndMs(slot) <= now, started: slotStartMs(slot) <= now };
}

export type NoticeEffectiveState = "unpublished" | "pending" | "active" | "expired";

/** 公告区间左闭右开：startsAt <= now < endsAt。 */
export function noticeEffectiveState(
  notice: { published: boolean; startsAt: string; endsAt: string },
  now = businessNow(),
): NoticeEffectiveState {
  if (!notice.published) return "unpublished";
  const start = Date.parse(notice.startsAt);
  const end = Date.parse(notice.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "unpublished";
  if (now < start) return "pending";
  if (now < end) return "active";
  return "expired";
}

export const noticeStateLabels: Record<NoticeEffectiveState, string> = {
  unpublished: "未发布",
  pending: "待生效",
  active: "生效中",
  expired: "已过期",
};

/** 订单有效窗口：入园当天 17:00 失效；停车到档结束后 30 分钟，右边界不含。 */
export function orderWindowEndMs(order: { type: "admission" | "parking"; slotDate: string; slotEnd: string }): number {
  if (order.type === "admission") return fromShanghai(order.slotDate, "17:00");
  return fromShanghai(order.slotDate, order.slotEnd) + 30 * 60_000;
}
