import { describe, it, expect } from "vitest";
import { buildSnapshot, scenarios, groupAlerts } from "../fixtures/ops";
import { regions, points } from "@scenic/scenic";
describe("园方完整 Mock", () => {
  it("默认四项及聚合一致", () => {
    const s = buildSnapshot();
    expect(s.public.visitors).toBe(5461);
    expect(s.checkedInToday).toBe(8236);
    expect(s.public.parkingFree).toBe(288);
    expect(s.alerts.filter((a) => a.status !== "resolved")).toHaveLength(7);
    expect(
      groupAlerts(s.alerts.filter((a) => a.status !== "resolved")).find(
        (g) => g.anchorId === "help-creek",
      )?.items,
    ).toHaveLength(2);
  });
  for (const scenario of scenarios)
    it(`${scenario.label} 的快照、历史及事件一致`, () => {
      const s = buildSnapshot(scenario.id);
      expect(buildSnapshot(scenario.id)).toEqual(s);
      expect(
        Object.values(s.public.regions).reduce((n, r) => n + r.count!, 0),
      ).toBe(s.public.visitors);
      expect(
        points
          .filter((p) => p.kind === "parking")
          .reduce((n, p) => n + s.public.points[p.id].parkingFree!, 0),
      ).toBe(s.public.parkingFree);
      expect(s.history.at(-1)?.count).toBe(s.public.visitors);
      expect(s.history.every((p) => p.time <= s.businessTime)).toBe(true);
      for (const a of s.alerts) {
        expect(a.reason.length).toBeGreaterThan(5);
        expect(a.metric.length).toBeGreaterThan(5);
        expect(a.records.every((r) => r.at <= s.businessTime)).toBe(true);
        if (a.status === "processing")
          expect(a.records.some((r) => r.kind === "started")).toBe(true);
        if (a.status === "resolved")
          expect(a.records.at(-1)?.kind).toBe("completed");
        if (a.status !== "resolved" && a.category === "crowd") {
          const region = regions.find((r) => r.id === a.regionId)!;
          expect(
            s.public.regions[region.id].count! / region.capacity,
          ).toBeGreaterThanOrEqual(0.85);
        }
      }
      for (const r of regions) {
        const state = s.public.regions[r.id];
        if (state.availability === "open") {
          const ratio = state.count! / r.capacity;
          expect(state.load).toBe(
            ratio >= 0.85 ? "busy" : ratio >= 0.6 ? "moderate" : "quiet",
          );
        }
      }
      expect(
        s.events.every((e) => s.alerts.some((a) => a.id === e.alertId)),
      ).toBe(true);
    });
  it("人工结案保留高负载，复发使用新事件", () => {
    const s = buildSnapshot("still-high");
    expect(s.alerts.find((a) => a.id === "A-230")?.status).toBe("resolved");
    expect(s.public.regions.Z4.load).toBe("busy");
    expect(s.alerts.filter((a) => a.status !== "resolved")).toHaveLength(6);
    const r = buildSnapshot("recurrence");
    expect(r.alerts.find((a) => a.id === "A-237")?.previousAlertId).toBe(
      "A-230",
    );
    expect(r.alerts.find((a) => a.id === "A-230")?.status).toBe("resolved");
  });
  it("例行检查不把可用设备标为故障", () => {
    const s = buildSnapshot();
    expect(s.public.points["aed-summit"].availability).toBe("open");
    expect(s.alerts.find((a) => a.category === "inspection")?.severity).toBe(
      "reminder",
    );
  });
});
