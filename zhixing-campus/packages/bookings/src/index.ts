import type { LeaveDetails } from "./leave";
import type { LeaveEvent } from "./leave-workflow";
export { leaveHistory, leaveActionLabel } from "./leave-workflow";
export type { LeaveEvent, LeaveAction } from "./leave-workflow";
export { watchDemoReset } from "./demo-reset";
export { leaveNatures, leaveDestinations, validateLeaveDetails, validLeaveTime, leaveTimes, leaveBounds, formatLeaveRange, formatLeaveDuration } from "./leave";
export type { LeaveDetails } from "./leave";
export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled";
export interface BookingRequest {
  id: string;
  facilityId: string;
  venue: string;
  owner: string;
  classId?: string; // Legacy records did not include a class.
  activity?: string;
  phone?: string;
  note?: string;
  date: string;
  time: string;
  count: number;
  purpose: string;
  status: BookingStatus;
  reviewReason?: string;
  reviewer?: string;
  createdAt: string;
  updatedAt: string;
}
export type NewBooking = Pick<BookingRequest, "facilityId" | "owner" | "date" | "time" | "count" | "purpose"> & {
  activity: string;
  phone: string;
  note?: string;
};

export type LeaveStatus = BookingStatus | "withdrawn" | "completed";
export interface LeaveRequest extends Partial<LeaveDetails> {
  id: string;
  owner: string;
  classId: string;
  type: "病假" | "事假" | "其他";
  startDate: string;
  startTime?: string;
  startPeriod?: "上午" | "下午";
  endDate: string;
  endTime?: string;
  endPeriod?: "上午" | "下午";
  reason: string;
  phone: string;
  status: LeaveStatus;
  revision?: number;
  history?: LeaveEvent[];
  completedAt?: string;
  completedBy?: string;
  reviewReason?: string;
  reviewer?: string;
  createdAt: string;
  updatedAt: string;
}
export type NewLeave = Pick<LeaveRequest, "owner" | "type" | "startDate" | "endDate" | "reason" | "phone"> & LeaveDetails & { startTime: string; endTime: string };
export interface SlotAvailability { time: string; available: boolean; pending: number; reason?: string }

export const bookingStatusLabel: Record<BookingStatus, string> = {
  pending: "待审核",
  approved: "已预约",
  rejected: "已拒绝",
  cancelled: "已取消",
};
export const leaveStatusLabel: Record<LeaveStatus, string> = {
  ...bookingStatusLabel,
  approved: "已通过",
  withdrawn: "已撤回",
  completed: "已完结",
};
export { bookingSlots, validBookingCount } from "./rules";
export function todayInShanghai() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
}
export class BookingApiError extends Error {
  constructor(message: string, public readonly status = 0) { super(message); }
}
export function createBookingClient(baseUrl = "http://localhost:5606") {
  async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new BookingApiError("预约审核服务暂不可连接，请稍后重试");
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new BookingApiError(typeof payload?.error === "string" ? payload.error : "操作失败，请重试", response.status);
    return payload.data as T;
  }
  return {
    list(owner?: string, teacher?: string) {
      const params = new URLSearchParams();
      if (owner) params.set("owner", owner);
      if (teacher) params.set("teacher", teacher);
      return request<BookingRequest[]>(`/api/bookings${params.size ? `?${params}` : ""}`);
    },
    availability(facilityId: string, date: string) {
      return request<SlotAvailability[]>(`/api/bookings/availability?facilityId=${encodeURIComponent(facilityId)}&date=${encodeURIComponent(date)}`);
    },
    create(input: NewBooking) { return request<BookingRequest>("/api/bookings", "POST", input); },
    review(id: string, decision: "approve" | "reject", reviewer: string, reason = "") {
      return request<BookingRequest>(`/api/bookings/${encodeURIComponent(id)}`, "PATCH", { action: decision, reviewer, reason });
    },
    cancel(id: string, owner: string) {
      return request<BookingRequest>(`/api/bookings/${encodeURIComponent(id)}`, "PATCH", { action: "cancel", owner });
    },
    listLeaves(owner?: string, teacher?: string) {
      const params = new URLSearchParams();
      if (owner) params.set("owner", owner);
      if (teacher) params.set("teacher", teacher);
      return request<LeaveRequest[]>(`/api/leaves${params.size ? `?${params}` : ""}`);
    },
    createLeave(input: NewLeave) { return request<LeaveRequest>("/api/leaves", "POST", input); },
    getLeave(id: string, owner: string) {
      return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}?owner=${encodeURIComponent(owner)}`);
    },
    reviewLeave(id: string, decision: "approve" | "reject", reviewer: string, reason = "", expectedRevision?: number) {
      return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}`, "PATCH", { action: decision, reviewer, reason, expectedRevision });
    },
    cancelLeave(id: string, owner: string, expectedRevision?: number) {
      return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}`, "PATCH", { action: "cancel", owner, expectedRevision });
    },
    completeLeave(id: string, owner: string, expectedRevision: number) {
      return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}`, "PATCH", { action: "complete", owner, expectedRevision, confirmedReturn: true });
    },
    withdrawLeave(id: string, owner: string, expectedRevision: number) {
      return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}`, "PATCH", { action: "withdraw", owner, expectedRevision });
    },
    resubmitLeave(id: string, input: NewLeave, expectedRevision: number) {
      return request<LeaveRequest>(`/api/leaves/${encodeURIComponent(id)}`, "PATCH", { ...input, action: "resubmit", expectedRevision });
    },
  };
}
