import { describe, it, expect } from "vitest";
import { createIntroTimeline } from "../../packages/scroll/src/timeline";
import { cableSupportLayout } from "../../packages/model/src/cable-supports";
import { edges } from "../../packages/model/src/data";
import {
  islandRockFloor,
  rockColumn,
} from "../../packages/model/src/rock-layout";
import {
  distanceToRoadSegment,
  isIsland,
} from "../../packages/model/src/geometry";

describe("scroll opening clock", () => {
  it("prepares before opening and excludes all preparation time from playback", () => {
    const timeline = createIntroTimeline(true);
    const held = timeline.advance(30, false, false);
    expect(held).toMatchObject({
      time: 0,
      state: "loading",
      open: 0,
      ink: 1,
      rise: 0,
    });
    expect(timeline.advance(12, false, false)).toEqual(held);
    expect(timeline.advance(0.7, true, false)).toMatchObject({
      time: 0.7,
      state: "opening",
    });
    expect(timeline.advance(2.3, true, false)).toMatchObject({
      time: 3,
      state: "revealing",
    });
    expect(timeline.advance(3, true, false)).toMatchObject({
      time: 6,
      state: "ready",
      rise: 1,
    });
    expect(timeline.advance(120, true, false).state).toBe("ready");
  });
  it("pauses while hidden, uses a static final view in reduced motion and exits on failure", () => {
    const timeline = createIntroTimeline(true),
      first = timeline.advance(1, true, false);
    expect(timeline.advance(80, true, false, true)).toEqual(first);
    expect(timeline.advance(0, true, true)).toMatchObject({
      state: "ready",
      open: 1,
      rise: 1,
    });
    timeline.fail();
    expect(timeline.advance(0, false, false).state).toBe("failed");
    expect(createIntroTimeline(true).advance(1, false, true)).toMatchObject({
      state: "loading",
      open: 1,
      rise: 0,
    });
    expect(createIntroTimeline(false).advance(0, true, false)).toMatchObject({
      state: "ready",
      rise: 1,
    });
  });
});

describe("cantilever cable support", () => {
  it("clears the full boardwalk and guardrails by at least .35 without moving the cable", () => {
    const [support, ...others] = cableSupportLayout();
    expect(support.shaft.x).toBeCloseTo(-2.9735, 3);
    expect(support.shaft.z).toBeCloseTo(-11.1449, 3);
    const edge = edges.find((e) => e.id === "road-4")!,
      path = edge.path!;
    // Include the 1.44-wide slab and rails at .47 width, plus .16-wide posts.
    const clearance =
      Math.min(
        ...path
          .slice(1)
          .map((p, i) =>
            distanceToRoadSegment(support.shaft.x, support.shaft.z, path[i], p),
          ),
      ) -
      Math.max(1.44 / 2, 1.44 * 0.47 + 0.08) -
      0.16 * Math.SQRT2;
    expect(clearance).toBeGreaterThanOrEqual(0.35);
    expect(others.map((s) => s.offset)).toEqual([0, 0]);
    expect(isIsland(support.shaft.x, support.shaft.z)).toBe(true);
    // Include the complete .85 cable turnaround width and cabin half-diagonal.
    const cabinRadius = Math.hypot(1.16, 0.92) / 2;
    expect(support.offset - 0.85 - cabinRadius - 0.16).toBeGreaterThan(0.3);
    expect(support.beamStart).toBeLessThan(-0.85);
    expect(support.beamEnd).toBeGreaterThan(support.offset);
  });
  it("keeps even the longest rock tail above the scroll wave crest", () => {
    const floor = islandRockFloor(),
      paperY = floor - 6;
    for (let x = -32; x <= 32; x += 1.1)
      for (let z = -30; z <= 36; z += 1.1) {
        if (!isIsland(x, z)) continue;
        const { bottom, tail } = rockColumn(x, z);
        expect(bottom - tail - (paperY + 5.3)).toBeGreaterThan(0.6);
      }
  });
});
