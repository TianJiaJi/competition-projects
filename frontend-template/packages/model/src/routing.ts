import type {
  PublicSnapshot,
  RoadEdge,
  RouteResult,
  TravelMode,
} from "@scene/contracts";
import { edges, nodes, pointById } from "./data";
import { visitorFixtures } from './visitor-points';
const sharedForecourts=new Set(visitorFixtures.map(p=>p.connectTo));
/** Closing equipment does not close a shared forecourt; explicit road closures still do. */
export function closedRouteNodes(snapshot:PublicSnapshot){
  return new Set(Object.entries(snapshot.points)
    .filter(([id,s])=>s.availability!=='open'&&!sharedForecourts.has(pointById[id]?.nodeId))
    .map(([id])=>pointById[id]?.nodeId));
}

export function shortestPath(
  from: string,
  to: string,
  roads: RoadEdge[],
  blocked: string[] = [],
): { nodeIds: string[]; edgeIds: string[]; distance: number } | null {
  const distances = new Map<string, number>([[from, 0]]),
    previous = new Map<string, { node: string; edge: string }>(),
    unvisited = new Set(nodes.map((n) => n.id));
  if (!unvisited.has(from) || !unvisited.has(to)) return null;
  while (unvisited.size) {
    const current = [...unvisited].sort(
      (a, b) =>
        (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity) ||
        a.localeCompare(b),
    )[0];
    const distance = distances.get(current) ?? Infinity;
    if (!Number.isFinite(distance)) return null;
    if (current === to) {
      const nodeIds = [to],
        edgeIds: string[] = [];
      let cursor = to;
      while (cursor !== from) {
        const step = previous.get(cursor)!;
        edgeIds.unshift(step.edge);
        nodeIds.unshift(step.node);
        cursor = step.node;
      }
      return { nodeIds, edgeIds, distance };
    }
    unvisited.delete(current);
    for (const road of roads) {
      if (blocked.includes(road.id)) continue;
      const next =
        road.from === current
          ? road.to
          : !road.directed && road.to === current
            ? road.from
            : null;
      if (!next || !unvisited.has(next)) continue;
      const candidate = distance + road.length;
      if (candidate < (distances.get(next) ?? Infinity)) {
        distances.set(next, candidate);
        previous.set(next, { node: current, edge: road.id });
      }
    }
  }
  return null;
}
export function findRoute(
  origin: string,
  destination: string,
  mode: TravelMode,
  snapshot: PublicSnapshot,
): RouteResult {
  const from = pointById[origin],
    to = pointById[destination];
  if (!from || !to) return { ok: false, reason: "请选择有效的起点与目的地。" };
  for (const point of [from, to]) {
    const state = snapshot.points[point.id];
    const region = snapshot.regions[point.regionId];
    if (
      !state ||
      state.availability !== "open" ||
      !region ||
      region.availability !== "open"
    )
      return {
        ok: false,
        reason: `${point.name}${state?.reason ? `：${state.reason}` : "暂不可作为路线起终点。"}`,
      };
  }
  const closedNodes = closedRouteNodes(snapshot);
  const allowed = edges.filter(
    (e) => !closedNodes.has(e.from) && !closedNodes.has(e.to),
  );
  const walk = allowed.filter((e) => e.mode === "walk");
  if (mode === "cable") {
    if (!["summit", "terminal-summit"].includes(origin) || destination !== "market")
      return {
        ok: false,
        reason: "索道方案用于望岳台或山顶游客终端到出口商业区的下行返程。",
      };
    if (
      snapshot.points.upper?.availability !== "open" ||
      snapshot.points.lower?.availability !== "open" ||
      snapshot.closedEdgeIds.includes("cable-down")
    )
      return { ok: false, reason: "索道当前停运，请选择步行返程。" };
    const first = shortestPath(
        from.nodeId,
        "upper",
        walk,
        snapshot.closedEdgeIds,
      ),
      last = shortestPath("lower", to.nodeId, walk, snapshot.closedEdgeIds),
      cable = edges.find((e) => e.id === "cable-down")!;
    if (!first || !last)
      return { ok: false, reason: "索道接驳步道暂不可通行，请选择步行返程。" };
    return {
      ok: true,
      origin,
      destination,
      mode,
      nodeIds: [...first.nodeIds, ...last.nodeIds],
      edgeIds: [...first.edgeIds, cable.id, ...last.edgeIds],
      distance: first.distance + cable.length + last.distance,
    };
  }
  const route = shortestPath(
    from.nodeId,
    to.nodeId,
    walk,
    snapshot.closedEdgeIds,
  );
  return route
    ? { ok: true, origin, destination, mode, ...route }
    : { ok: false, reason: "暂时无法到达：相关步道未开放。" };
}
