import type { CampusMarker, MarkerProjection } from "./markers";
export interface PlacedMarker extends CampusMarker {
  x: number;
  y: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}
/** Stable priority, bounded candidate positions, and leaders keep labels off their neighbours. */
export function arrangeCampusMarkers(
  markers: CampusMarker[],
  projections: Record<string, MarkerProjection>,
  width: number,
  height: number,
): PlacedMarker[] {
  const placed: PlacedMarker[] = [];
  const offsets = [0, -40, 40, -80, 80, -120, 120, -160, 160];
  for (const marker of markers) {
    const p = projections[marker.id];
    if (!p?.visible) continue;
    const w = marker.alwaysLabel
        ? Math.max(116, marker.name.length * 13 + 38)
        : 36,
      h = 36;
    const preferredY = p.y - (marker.tier ?? 0) * 24;
    const candidates = offsets
      .flatMap((dy) =>
        [0, -w, w, -w * 2, w * 2].map((dx) => ({
          x: Math.max(w / 2 + 10, Math.min(width - w / 2 - 10, p.x + dx)),
          y: Math.max(56, Math.min(height - 110, preferredY + dy)),
          cost: dy * dy + dx * dx * 1.3,
        })),
      )
      .sort((a, b) => a.cost - b.cost);
    const candidate = candidates.find((c) =>
      placed.every(
        (other) =>
          Math.abs(c.x - other.x) > (w + other.width) / 2 + 7 ||
          Math.abs(c.y - other.y) > h + 7,
      ),
    );
    // Keep named places accessible even in a compact viewport by using a denser secondary scan.
    const fallback =
      candidate ??
      candidates.reduce<{
        x: number;
        y: number;
        cost: number;
        overlap: number;
      }>(
        (best, c) => {
          const overlap = placed.filter(
            (o) =>
              Math.abs(c.x - o.x) < (w + o.width) / 2 + 7 &&
              Math.abs(c.y - o.y) < h + 7,
          ).length;
          return overlap < best.overlap ? { ...c, overlap } : best;
        },
        { ...candidates[0], overlap: Infinity },
      );
    placed.push({
      ...marker,
      x: fallback.x,
      y: fallback.y,
      originX: p.x,
      originY: p.y,
      width: w,
      height: h,
    });
  }
  return placed;
}
