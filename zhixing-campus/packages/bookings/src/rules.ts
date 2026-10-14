// Shared by the student form and the HTTP service.
export const bookingSlots = [
  "09:00–10:00", "10:00–11:00", "11:00–12:00",
  "14:00–15:00", "15:00–16:00", "16:00–17:00",
  "18:00–19:00", "19:00–20:00",
] as const;

export function validBookingCount(count: unknown, capacity: number): boolean {
  return typeof count === "number" && Number.isInteger(count) && count >= 1 && count <= capacity;
}
