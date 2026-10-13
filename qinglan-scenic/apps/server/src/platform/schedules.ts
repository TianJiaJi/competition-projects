import { assert, integer, type Store } from "./store.ts";
import type { Booking } from "../../../../packages/contracts/src/platform.ts";
import { dateOf, hourOf, U } from "./simulation.ts";
export interface ScheduleSlot {
  start: string;
  end: string;
  capacity: number;
}
export interface BookingSchedule {
  id: string;
  date: string;
  kind: string;
  lotId?: string;
  slots: ScheduleSlot[];
  version: number;
}
export function minutes(value: string) {
  assert(
    /^\d{2}:\d{2}$/.test(value),
    "VALIDATION_ERROR",
    "时间格式为 HH:mm",
    400,
  );
  const [h, m] = value.split(":").map(Number);
  assert(h < 24 && m < 60, "VALIDATION_ERROR", "时间无效", 400);
  return h * 60 + m;
}
export function validDate(value: string) {
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + "T12:00:00+08:00")) &&
      dateOf(Date.parse(value + "T12:00:00+08:00")) === value,
    "VALIDATION_ERROR",
    "日期无效",
    400,
  );
  return value;
}
export async function bookingSlots(
  store: Store,
  runId: string,
  time: number,
  date: string,
  kind: string,
  lotId?: string,
) {
  validDate(date);
  assert(
    ["entry", "parking"].includes(kind),
    "VALIDATION_ERROR",
    "预约类型无效",
    400,
  );
  if (kind === "parking")
    assert(
      ["p1", "p2", "p3"].includes(lotId || ""),
      "VALIDATION_ERROR",
      "请选择停车场",
      400,
    );
  const schedule = await store.get<BookingSchedule>(
    "schedules",
    [date, kind, lotId || ""].join("|"),
    runId,
  );
  const orders = await store.list<Booking>("orders", runId);
  const slots =
    schedule?.slots ??
    Array.from({ length: 9 }, (_, i) => ({
      start: String(i + 8).padStart(2, "0") + ":00",
      end: String(i + 9).padStart(2, "0") + ":00",
      capacity:
        kind === "entry"
          ? 20 +
            Math.floor(
              U(
                [
                  date,
                  kind,
                  lotId || "",
                  String(i + 8).padStart(2, "0") + ":00",
                ].join("|"),
              ) * 21,
            )
          : 2 +
            Math.floor(
              U(
                [
                  date,
                  kind,
                  lotId || "",
                  String(i + 8).padStart(2, "0") + ":00",
                ].join("|"),
              ) * 3,
            ),
    }));
  return Promise.all(
    slots.map(async (s) => {
      const id = [date, kind, lotId || "", s.start].join("|");
      const capacity =
        (await store.get<{ capacity: number }>("quotas", id, runId))
          ?.capacity ?? s.capacity;
      const used = orders
        .filter(
          (o) =>
            o.date === date &&
            o.kind === kind &&
            o.lotId === lotId &&
            o.slot === s.start &&
            o.status === "confirmed",
        )
        .reduce((n, o) => n + o.people, 0);
      return {
        id,
        date,
        kind,
        lotId,
        slot: s.start,
        end: s.end,
        capacity,
        used,
        remaining: capacity - used,
        bookable:
          date > dateOf(time) ||
          (date === dateOf(time) && minutes(s.end) > hourOf(time) * 60),
      };
    }),
  );
}
export async function saveSchedule(
  store: Store,
  runId: string,
  time: number,
  input: any,
) {
  const from = validDate(input.from),
    to = validDate(input.to),
    days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  assert(
    from >= dateOf(time) && days >= 0 && days <= 90,
    "VALIDATION_ERROR",
    "日期范围须为今天起的连续 1—91 天",
    400,
  );
  const kind = input.kind,
    lotId = kind === "parking" ? input.lotId : undefined;
  assert(
    ["entry", "parking"].includes(kind) &&
      (kind !== "parking" || ["p1", "p2", "p3"].includes(lotId)),
    "VALIDATION_ERROR",
    "预约类型或停车场无效",
    400,
  );
  assert(
    Array.isArray(input.slots) && input.slots.length <= 100,
    "VALIDATION_ERROR",
    "时段列表无效",
    400,
  );
  const rows: ScheduleSlot[] = input.slots
    .map((s: any) => {
      assert(
        s && typeof s.start === "string" && typeof s.end === "string",
        "VALIDATION_ERROR",
        "请填写完整时段",
        400,
      );
      minutes(s.start);
      minutes(s.end);
      return { start: s.start, end: s.end, capacity: integer(s.capacity) };
    })
    .sort((a: ScheduleSlot, b: ScheduleSlot) => a.start.localeCompare(b.start));
  rows.forEach((s, i) => {
    assert(
      minutes(s.start) >= 480 &&
        minutes(s.end) <= 1020 &&
        minutes(s.start) < minutes(s.end),
      "VALIDATION_ERROR",
      "时段须位于 08:00—17:00 且开始早于结束",
      400,
    );
    assert(
      !i || rows[i - 1].end <= s.start,
      "VALIDATION_ERROR",
      "预约时段不能重叠",
      400,
    );
  });
  for (let i = 0; i <= days; i++) {
    const date = dateOf(Date.parse(from + "T12:00:00+08:00") + i * 86400000);
    const old = await bookingSlots(store, runId, time, date, kind, lotId);
    for (const s of old.filter((s) => s.used > 0)) {
      const next = rows.find((n) => n.start === s.slot && n.end === s.end);
      assert(
        next && next.capacity >= s.used,
        "SLOT_CONFLICT",
        `${date} ${s.slot}—${s.end} 已有 ${s.used} 份预约，不能删除、改时或减少至占用量以下`,
      );
    }
    const id = [date, kind, lotId || ""].join("|"),
      prev = await store.get<BookingSchedule>("schedules", id, runId);
    await store.put(
      "schedules",
      id,
      { id, date, kind, lotId, slots: rows, version: (prev?.version || 0) + 1 },
      runId,
    );
    for (const s of old)
      await store.db
        .prepare(
          "DELETE FROM documents WHERE collection=$1 AND id=$2 AND run_id=$3",
        )
        .run("quotas", s.id, runId);
  }
  return { days: days + 1 };
}
