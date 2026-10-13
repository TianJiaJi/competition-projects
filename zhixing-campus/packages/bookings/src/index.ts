export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface BookingRequest {
  id: string;
  facilityId: string;
  venue: string;
  owner: string;
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

export type NewBooking = Pick<
  BookingRequest,
  "facilityId" | "owner" | "date" | "time" | "count" | "purpose"
>;

export const bookingStatusLabel: Record<BookingStatus, string> = {
  pending: "待审核",
  approved: "已预约",
  rejected: "已拒绝",
  cancelled: "已取消",
};

export const bookingSlots = ["09:00–10:00", "14:00–15:00", "18:00–19:00"] as const;

export function todayInShanghai() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
}

export class BookingApiError extends Error {
  constructor(message: string, public readonly status = 0) {
    super(message);
  }
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
    if (!response.ok)
      throw new BookingApiError(
        typeof payload?.error === "string" ? payload.error : "预约操作失败，请重试",
        response.status,
      );
    return payload.data as T;
  }
  return {
    list(owner?: string) {
      return request<BookingRequest[]>(
        `/api/bookings${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`,
      );
    },
    create(input: NewBooking) {
      return request<BookingRequest>("/api/bookings", "POST", input);
    },
    review(id: string, decision: "approve" | "reject", reviewer: string, reason = "") {
      return request<BookingRequest>(
        `/api/bookings/${encodeURIComponent(id)}`,
        "PATCH",
        { action: decision, reviewer, reason },
      );
    },
    cancel(id: string, owner: string) {
      return request<BookingRequest>(
        `/api/bookings/${encodeURIComponent(id)}`,
        "PATCH",
        { action: "cancel", owner },
      );
    },
  };
}
