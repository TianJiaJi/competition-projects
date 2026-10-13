import { describe, it, expect } from "vitest";
import {
  seed,
  createOrder,
  cancelOrder,
  rescheduleOrder,
  enter,
  availability,
  dateAt,
  slots,
  matchingRoutes,
  useRoute,
  sendMessage,
} from "../fixtures/mobile-domain";
import type {
  OrderInput,
  Preferences,
} from "../../apps/mobile/src/model/types";
import data from "../../apps/mobile/src/data";
const input: OrderInput = {
  kind: "entry",
  date: dateAt(),
  slot: slots[0],
  people: 3,
  name: "测试游客",
  phone: "13800000000",
  plate: "",
  parkingId: "p1",
};
const preferences: Preferences = {
  hours: 4,
  interests: [],
  pace: "紧凑",
  elderly: false,
  children: false,
  accessible: false,
  required: [],
  avoidBusy: false,
};
describe("mobile local business", () => {
  it("rejects changed payloads for an existing order identifier", () => {
    const s = seed();
    createOrder(s, input, "same");
    expect(createOrder(s, input, "same").id).toBe("same");
    expect(() => createOrder(s, { ...input, people: 5 }, "same")).toThrow(
      "内容不一致",
    );
    expect(s.orders).toHaveLength(1);
  });
  it("keeps bookings separate from attendance and makes entry idempotent", () => {
    const s = seed();
    createOrder(s, input, "test-order");
    expect(s.orders[0].entered).toBe(false);
    enter(s, "test-order");
    enter(s, "test-order");
    expect(
      s.orders.filter((o) => o.entered).reduce((n, o) => n + o.people, 0),
    ).toBe(3);
    expect(availability(s, input.date, input.slot, "entry")).toBe(27);
    expect(() => cancelOrder(s, "test-order")).toThrow();
  });
  it("does not oversell and cancellation returns quota exactly once", () => {
    const s = seed();
    for (let i = 0; i < 3; i++)
      createOrder(s, { ...input, people: 10 }, "bulk-" + i);
    expect(() => createOrder(s, input, "overflow")).toThrow("名额不足");
    cancelOrder(s, "bulk-0");
    cancelOrder(s, "bulk-0");
    expect(availability(s, input.date, input.slot, "entry")).toBe(10);
  });
  it("retains the original booking when rescheduling to a full slot", () => {
    const s = seed();
    createOrder(s, input, "move");
    for (let i = 0; i < 3; i++)
      createOrder(s, { ...input, slot: slots[1], people: 10 }, "full-" + i);
    expect(() => rescheduleOrder(s, "move", input.date, slots[1])).toThrow(
      "原预约已保留",
    );
    expect(s.orders.find((o) => o.id === "move")?.slot).toBe(slots[0]);
  });
  it("keeps parking quota separate and cannot use parking for personnel entry", () => {
    const s = seed();
    createOrder(s, { ...input, kind: "parking", plate: "浙A12345" }, "park");
    expect(availability(s, input.date, input.slot, "entry")).toBe(30);
    expect(availability(s, input.date, input.slot, "parking")).toBe(11);
    expect(() => enter(s, "park")).toThrow();
  });
  it("filters blocked paths and required stops without changing live templates", () => {
    const s = seed();
    s.closedPoints = [];
    s.closedEdges = [];
    const all = matchingRoutes(s, preferences);
    expect(all.length).toBeGreaterThan(0);
    const r = all[0];
    s.closedEdges = [r.edgeIds[0]];
    expect(matchingRoutes(s, preferences).some((x) => x.id === r.id)).toBe(
      false,
    );
    expect(() => useRoute(s, r.id)).toThrow();
    expect(
      matchingRoutes(s, { ...preferences, required: ["unknown"] }),
    ).toEqual([]);
  });
  it("every route edge is real and adjacent endpoints connect", () => {
    for (const r of data.routes) {
      expect(r.path.length).toBeGreaterThan(1);
      for (const id of r.edgeIds)
        expect(data.edges.some((e) => e.id === id)).toBe(true);
      expect(r.minutes).toBeGreaterThan(0);
    }
  });
  it("keeps room messages isolated and rejects blank text", () => {
    const s = seed();
    sendMessage(s, "park", "你好");
    sendMessage(s, "lake", "镜湖见");
    expect(
      s.messages
        .filter((m) => !m.simulated && m.room === "park")
        .map((m) => m.text),
    ).toEqual(["你好"]);
    expect(() => sendMessage(s, "park", " ")).toThrow();
    expect(() => sendMessage(s, "bad", "消息")).toThrow();
  });
});
