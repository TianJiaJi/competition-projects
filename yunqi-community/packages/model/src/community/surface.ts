import {
  insideIsland,
  inFootprint,
  garage,
  parking,
  roads,
  roadDistance,
} from "./layout";
export type SurfaceKind = "road" | "walk" | "grass";
export interface SurfaceCell {
  x: number;
  z: number;
  kind: SurfaceKind;
}
export const surfaceStep = 1;
/** One cell has exactly one top surface; intersections cannot z-fight. */
export function createSurfaceCells(): SurfaceCell[] {
  const cells: SurfaceCell[] = [];
  for (let x = -54.5; x < 55; x += surfaceStep)
    for (let z = -44.5; z < 45; z += surfaceStep) {
      if (!insideIsland(x, z, 0.55) || inFootprint(x, z, garage)) continue;
      const car =
        parking.some((p) => inFootprint(x, z, p)) ||
        roads.some(
          (r) => r.kind === "road" && roadDistance(x, z, r) <= r.width / 2,
        );
      const walk =
        !car &&
        roads.some(
          (r) => r.kind === "walk" && roadDistance(x, z, r) <= r.width / 2,
        );
      cells.push({ x, z, kind: car ? "road" : walk ? "walk" : "grass" });
    }
  return cells;
}
