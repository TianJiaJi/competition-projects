import { edges } from "@scenic/scenic";
import type { RoadEdge } from "@scenic/contracts";

export interface PathCheckpoint {
  id: string;
  label: string;
  /** 区域代表节点、开放景点或仍有占用的可定位设施。 */
  kind: "region" | "attraction" | "occupied";
}

export interface PathCheckResult {
  /** 候选状态是否通过：出口可用且没有新增不可达。 */
  ok: boolean;
  /** 候选状态新增不可达的节点。 */
  newBlocked: PathCheckpoint[];
  /** 现状已不可达的问题（不阻断提交，单独展示）。 */
  existing: PathCheckpoint[];
  exitAvailable: boolean;
}

export const EXIT_NODE_ID = "gate-out";

export interface PathCheckInput {
  checkpointNodes: string[];
  checkpointLabels: Record<string, PathCheckpoint>;
  closedRoadIds: string[];
  closedFacilityIds: string[];
}

function walkEdges(closedRoadIds: string[]): RoadEdge[] {
  const closed = new Set(closedRoadIds);
  return edges.filter((edge) => edge.mode === "walk" && !closed.has(edge.id));
}

function reachableFrom(exitNode: string, closedRoadIds: string[]): Set<string> {
  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    const list = adjacency.get(a);
    if (list) list.push(b);
    else adjacency.set(a, [b]);
  };
  for (const edge of walkEdges(closedRoadIds)) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  const seen = new Set<string>([exitNode]);
  const queue = [exitNode];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * 需求文档 §4.2：以步行通路为准，不能只依赖索道撤离。
 * 出口 `gate-out` 是唯一配置出口，被停用或不可达时始终拒绝。
 */
export function evaluateReturnPaths(input: PathCheckInput): PathCheckResult {
  const baselineReach = reachableFrom(EXIT_NODE_ID, []);
  const exitAvailable = !input.closedFacilityIds.includes(EXIT_NODE_ID);
  const candidateReach = reachableFrom(EXIT_NODE_ID, input.closedRoadIds);

  const existing: PathCheckpoint[] = [];
  const newBlocked: PathCheckpoint[] = [];
  for (const node of input.checkpointNodes) {
    const checkpoint = input.checkpointLabels[node] ?? { id: node, label: node, kind: "occupied" as const };
    const reachableBefore = baselineReach.has(node);
    const reachableNow = candidateReach.has(node);
    if (!reachableBefore) existing.push(checkpoint);
    else if (!reachableNow) newBlocked.push(checkpoint);
  }
  if (!exitAvailable) existing.push(input.checkpointLabels[EXIT_NODE_ID] ?? { id: EXIT_NODE_ID, label: "景区出口", kind: "occupied" });
  return {
    ok: exitAvailable && newBlocked.length === 0,
    newBlocked,
    existing,
    exitAvailable,
  };
}
