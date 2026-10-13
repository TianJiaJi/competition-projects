import { describe, expect, it } from "vitest";
import {
  buildings,
  buildingGroups,
  buildingPoint,
  buildingElevation,
  dormWings,
  insideIsland,
  roads,
  shops,
  gates,
  athletics,
  metresPerUnit,
  terrainHeight,
  recordAnchor,
  bridge,
  lakeContains,
  inBuildingFootprint,
  campusLobes,
} from "../../packages/model/src/campus/layout";
import {
  campusMarkers,
  campusPlaces,
  safetySites,
} from "../../packages/model/src/campus/markers";
import { arrangeCampusMarkers } from "../../packages/model/src/campus/marker-layout";
import { sportsSites } from "../../packages/model/src/campus/terrain";

describe("campus spatial contract", () => {
  it("contains four large three-wing courts, four teaching blocks and a single teacher dorm", () => {
    const dorms = buildings.filter((b) => b.kind === "dorm");
    expect(dorms).toHaveLength(4);
    expect(dormWings).toHaveLength(12);
    for (const b of dorms) {
      expect(dormWings.filter((w) => w.parentId === b.id)).toHaveLength(3);
      expect(b.width).toBeGreaterThanOrEqual(25);
      expect(b.depth).toBeGreaterThanOrEqual(24);
    }
    expect(buildings.filter((b) => b.kind === "teaching")).toHaveLength(4);
    expect(buildings.filter((b) => b.kind === "teacher")).toHaveLength(1);
    expect(buildings.filter((b) => b.kind === "gym")).toHaveLength(1);
    expect(buildings.filter((b) => b.kind === "auditorium")).toHaveLength(1);
  });
  it("keeps each group aligned while distinct groups follow different contours", () => {
    for (const g of buildingGroups) {
      const headings = buildings
        .filter((b) => g.ids.includes(b.id))
        .map((b) => b.heading);
      expect(new Set(headings).size).toBe(1);
    }
    expect(new Set(buildings.map((b) => b.heading)).size).toBeGreaterThan(3);
    expect(campusLobes[0].radius / campusLobes[1].radius).toBeGreaterThan(2);
  });
  it("supports every building and food-street footprint on the island", () => {
    for (const b of [...buildings, ...shops])
      for (const sx of [-1, 0, 1])
        for (const sz of [-1, 0, 1]) {
          const p = buildingPoint(
            b as (typeof buildings)[number],
            b.x + (sx * b.width) / 2,
            b.z + (sz * b.depth) / 2,
          );
          expect(insideIsland(...p), b.id + " has a floating corner").toBe(
            true,
          );
          expect(
            buildingElevation(b) + 0.001,
            b.id + " sinks into ground",
          ).toBeGreaterThanOrEqual(terrainHeight(...p));
        }
    expect(gates).toHaveLength(2);
  });
  it("retains the 400m measured first lane and eight full lanes", () => {
    const circumference =
      (2 * athletics.straight +
        2 * Math.PI * (athletics.innerRadius + athletics.measureOffset)) *
      metresPerUnit;
    expect(circumference).toBeCloseTo(400, 1);
    expect(athletics.lanes).toBe(8);
  });
  it("keeps the entire athletics and basketball sites level and above surrounding ground cells", () => {
    const problems = new Set<string>();
    for (const [id, site] of Object.entries(sportsSites)) {
      for (
        let x = site.x - site.width / 2;
        x <= site.x + site.width / 2;
        x += 0.5
      )
        for (
          let z = site.z - site.depth / 2;
          z <= site.z + site.depth / 2;
          z += 0.5
        ) {
          if (Math.abs(terrainHeight(x, z) - site.elevation) > 0.001)
            problems.add(id + " has uneven ground beneath its surface");
        }
    }
    expect([...problems]).toEqual([]);
  });
  it("keeps every road and walk on land and clear of buildings and shops", () => {
    const problems = new Set<string>();
    for (const r of roads)
      for (let j = 1; j < r.points.length; j++) {
        const a = r.points[j - 1],
          b = r.points[j],
          steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2);
        for (let i = 0; i <= steps; i++) {
          const x = a[0] + ((b[0] - a[0]) * i) / steps,
            z = a[1] + ((b[1] - a[1]) * i) / steps;
          if (!insideIsland(x, z)) problems.add(r.id + " leaves island");
          if (lakeContains(x, z))
            problems.add(r.id + " enters the lake without a bridge");
          for (const b of [...buildings, ...shops])
            if (
              inBuildingFootprint(
                x,
                z,
                b as (typeof buildings)[number],
                r.width * 0.5,
              )
            )
              problems.add(r.id + " crosses " + b.id);
        }
      }
    expect([...problems]).toEqual([]);
  });
  it("anchors the bridge at two shore locations instead of in open water", () => {
    expect(lakeContains(...bridge.from)).toBe(false);
    expect(lakeContains(...bridge.to)).toBe(false);
    const mid: [number, number] = [
      (bridge.from[0] + bridge.to[0]) / 2,
      (bridge.from[1] + bridge.to[1]) / 2,
    ];
    expect(lakeContains(...mid)).toBe(true);
  });
  it("covers safety with six AEDs, nine fire points and the clinic, without fake records", () => {
    expect(safetySites.filter((s) => s.kind === "aed")).toHaveLength(6);
    expect(safetySites.filter((s) => s.kind === "fire")).toHaveLength(9);
    expect(campusMarkers.find((m) => m.id === "clinic")?.view).toBe("safety");
    for (const anchor of Object.values(recordAnchor))
      expect(
        campusPlaces.some((p) => p.id === anchor),
        anchor,
      ).toBe(true);
  });
  it("separates the six academic labels even if their projections cluster", () => {
    const markers = campusMarkers.filter((m) => m.view === "learning");
    const positions = Object.fromEntries(
      markers.map((m, i) => [
        m.id,
        { x: 600 + i * 7, y: 400 + i * 5, visible: true },
      ]),
    );
    const placed = arrangeCampusMarkers(markers, positions, 1366, 768);
    expect(placed).toHaveLength(6);
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i],
          b = placed[j];
        expect(
          Math.abs(a.x - b.x) > (a.width + b.width) / 2 ||
            Math.abs(a.y - b.y) > 36,
        ).toBe(true);
      }
  });
});
