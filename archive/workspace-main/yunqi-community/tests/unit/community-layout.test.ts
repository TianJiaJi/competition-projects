import { describe, it, expect } from "vitest";
import {
  buildings,
  anchors,
  anchorById,
  recordAnchor,
  parking,
  garage,
  water,
  roads,
  insideIsland,
  overlaps,
  roadDistance,
  terrainHeight,
  type CommunityRoad,
  type Footprint,
} from "../../packages/model/src/community/layout";
import { createSurfaceCells } from "../../packages/model/src/community/surface";
import { scenario } from "../../scenario/config";

function samples(r: CommunityRoad) {
  return r.points.slice(1).flatMap((b, i) => {
    const a = r.points[i],
      steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.3);
    return Array.from({ length: steps + 1 }, (_, j) => ({
      x: a[0] + ((b[0] - a[0]) * j) / steps,
      z: a[1] + ((b[1] - a[1]) * j) / steps,
    }));
  });
}
function hits(p: Footprint, r: CommunityRoad) {
  return samples(r).some((s) =>
    overlaps(p, { ...s, width: r.width, depth: r.width }),
  );
}
describe("云栖雅苑住宅与公共设施布局", () => {
  it("住宅组团、编号和层数与已定方案及前端一致", () => {
    expect(
      buildings.filter((b) => b.kind === "tower").map((b) => b.id),
    ).toEqual(scenario.seed.buildings.map((b) => b.id));
    expect(
      buildings.filter((b) => b.kind === "tower").map((b) => b.floors),
    ).toEqual([8, 10, 12, 8, 10, 12]);
    for (const kind of ["detached", "duplex", "townhouse"])
      expect(buildings.filter((b) => b.kind === kind)).toHaveLength(2);
    for (const b of buildings.filter((b) => b.kind === "tower"))
      expect(b.id < "B4" ? b.x > 0 : b.x < 0).toBe(true);
    expect(
      buildings
        .filter((b) => b.kind === "townhouse")
        .every((b) => b.units === 3),
    ).toBe(true);
  });
  it("建筑、停车、水景和车库开口不重叠且在岛界以内", () => {
    const sites = [...buildings, ...parking, garage, water];
    for (const [i, a] of sites.entries()) {
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          expect(
            insideIsland(a.x + (sx * a.width) / 2, a.z + (sz * a.depth) / 2),
            a.id,
          ).toBe(true);
      for (const b of sites.slice(i + 1))
        expect(overlaps(a, b), `${a.id} overlaps ${b.id}`).toBe(false);
      for (const road of roads.filter(
        (r) => !parking.some((p) => p.id === a.id) && r.kind === "road" && !(a.id===garage.id&&r.id==="garage-approach"),
      ))
        expect(hits(a, road), `${a.id} overlaps ${road.id}`).toBe(false);
    }
  });
  it("全部现有设施、停车、预约、工单和巡检均归属实际场所", () => {
    expect(new Set(anchors.map((a) => a.id)).size).toBe(anchors.length);
    const seen = new Set<string>();
    for (const a of anchors) {
      if (a.parentId) expect(anchorById[a.parentId], a.id).toBeDefined();
      for (const record of a.records) {
        expect(seen.has(record), `duplicate ${record}`).toBe(false);
        seen.add(record);
      }
    }
    for (const collection of [
      "facilities",
      "parking",
      "bookings",
      "tasks",
      "inspections",
      "notices",
      "security",
    ] as const)
      for (const record of scenario.seed[collection])
        expect(
          anchorById[recordAnchor[record.id]],
          `${collection}/${record.id}`,
        ).toBeDefined();
    expect(anchorById.F2.parentId).toBe("life-center");
    expect(anchorById.F2.y).toBeGreaterThan(0);
    expect(anchorById.C3.parentId).toBe("life-center");
    expect(anchorById.C3.y).toBeLessThan(0);
    expect(anchorById.F4.parentId).toBe("B2");
    expect(recordAnchor.I3).toBe("B1-lift");
    expect(anchorById.F5.x).toBeGreaterThan(0);
    expect(anchorById.F5.z).toBeLessThan(0);
    const clearance = {
      x: anchorById.F5.x,
      z: anchorById.F5.z,
      width: 1.6,
      depth: 1.6,
    };
    expect([...buildings, water].some((b) => overlaps(clearance, b))).toBe(
      false,
    );
  });
  it("地表格不重复，所有车行与步行道路保持平整", () => {
    const cells = createSurfaceCells();
    expect(new Set(cells.map((c) => `${c.x}/${c.z}`)).size).toBe(cells.length);
    for (const cell of cells.filter(
      (c) => c.kind === "road" || c.kind === "walk",
    ))
      expect(terrainHeight(cell.x, cell.z), `${cell.x}/${cell.z}`).toBe(0);
  });
  it("车行路网连通、停车场有入口且车库北口与消防通道相接", () => {
    const carRoads = roads.filter((r) => r.kind === "road");
    const reached = new Set([carRoads[0].id]);
    for (let i = 0; i < carRoads.length; i++)
      for (const a of carRoads)
        if (reached.has(a.id))
          for (const b of carRoads)
            if (
              samples(a).some(
                (p) => roadDistance(p.x, p.z, b) <= (a.width + b.width) / 2,
              )
            )
              reached.add(b.id);
    expect(reached.size).toBe(carRoads.length);
    for (const p of parking)
      expect(carRoads.some((r) => hits(p, r))).toBe(true);
    const entry = {
      x: garage.x,
      z: garage.z - garage.depth / 2,
      width: garage.width,
      depth: 0.1,
    };
    expect(carRoads.some((r) => hits(entry, r))).toBe(true);
    for (const id of ["east-gate", "west-gate"]) {
      const a = anchorById[id];
      expect(carRoads.some((r) => hits({ ...a, width: 1, depth: 1 }, r))).toBe(
        true,
      );
    }
  });
});
