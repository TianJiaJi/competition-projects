import { describe, expect, it } from "vitest";
import {
  sleeveExposure,
  type SleeveSurface,
} from "../../packages/ui/src/record-rack/exposure";
const viewport = { width: 500, height: 500 };
const target: SleeveSurface = {
  x: 150,
  y: 150,
  width: 200,
  height: 200,
  angle: 0,
  layer: 1,
};
describe("sleeve exposed area", () => {
  it("distinguishes 80%, 85% and 90% exposure without index special cases", () => {
    for (const ratio of [0.8, 0.85, 0.9]) {
      const cover = { ...target, x: target.x + target.width * ratio, layer: 2 };
      expect(sleeveExposure(target, [target, cover], viewport)).toBeCloseTo(
        ratio,
      );
    }
  });
  it("counts viewport clipping, front discs and overlapping covers only once", () => {
    expect(sleeveExposure({ ...target, x: 0 }, [], viewport)).toBe(0.5);
    const cover = { ...target, x: 250, layer: 2 };
    expect(
      sleeveExposure(target, [cover, { ...cover, layer: 3 }], viewport),
    ).toBe(0.5);
    expect(sleeveExposure(target, [{ ...cover, layer: 0 }], viewport)).toBe(1);
    expect(
      sleeveExposure(
        target,
        [{ ...cover, x: 450, disc: { x: 150, y: 150, radius: 100 } }],
        viewport,
      ),
    ).toBeLessThan(0.3);
  });
  it("handles rotated sleeves", () => {
    expect(
      sleeveExposure({ ...target, angle: Math.PI / 4 }, [], viewport),
    ).toBe(1);
  });
});
