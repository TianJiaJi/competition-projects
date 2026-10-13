import type { RestroomPartKey } from "./types";
import { RESTROOM_PART_KEYS } from "./types";

export interface PartBaseline {
  occupied: number;
  queue: number;
  baselinePaused: number;
}

export type RestroomState = "open" | "maintenance" | "closed";

export interface RestroomPartMetrics {
  key: RestroomPartKey;
  total: number;
  occupied: number;
  queue: number;
  baselinePaused: number;
  requestedPaused: number;
  effectivePaused: number;
  pendingRelease: number;
  available: number;
}

export interface RestroomMetrics {
  parts: RestroomPartMetrics[];
  totals: {
    total: number;
    occupied: number;
    effectivePaused: number;
    pendingRelease: number;
    available: number;
    queue: number;
  };
  dataIssue?: string;
}

/**
 * 需求文档 §4.3：整座开放时 S=max(B,min(R,N-O))、W=max(0,R-S)、A=N-O-S；
 * 整座关闭／维护时 S=N-O、W=O、A=0，原人工申请 R 保留。
 */
export function computeRestroomPart(
  key: RestroomPartKey,
  total: number,
  baseline: PartBaseline,
  state: RestroomState,
  requestedPaused: number,
): RestroomPartMetrics {
  const occupied = baseline.occupied;
  const baselinePaused = baseline.baselinePaused;
  const requested = Math.max(0, Math.trunc(requestedPaused));
  let effectivePaused: number;
  let pendingRelease: number;
  let available: number;
  if (state === "open") {
    effectivePaused = Math.max(baselinePaused, Math.min(requested, Math.max(0, total - occupied)));
    pendingRelease = Math.max(0, requested - effectivePaused);
    available = Math.max(0, total - occupied - effectivePaused);
  } else {
    effectivePaused = Math.max(0, total - occupied);
    pendingRelease = occupied;
    available = 0;
  }
  return {
    key,
    total,
    occupied,
    queue: baseline.queue,
    baselinePaused,
    requestedPaused: requested,
    effectivePaused,
    pendingRelease,
    available,
  };
}

export function computeRestroomMetrics(
  capacities: Record<RestroomPartKey, number>,
  baselines: Record<RestroomPartKey, PartBaseline>,
  state: RestroomState,
  requested: Record<RestroomPartKey, number>,
): RestroomMetrics {
  const parts = RESTROOM_PART_KEYS.map((key) =>
    computeRestroomPart(key, capacities[key], baselines[key], state, requested[key] ?? 0),
  );
  const totals = parts.reduce(
    (acc, part) => ({
      total: acc.total + part.total,
      occupied: acc.occupied + part.occupied,
      effectivePaused: acc.effectivePaused + part.effectivePaused,
      pendingRelease: acc.pendingRelease + part.pendingRelease,
      available: acc.available + part.available,
      queue: acc.queue + part.queue,
    }),
    { total: 0, occupied: 0, effectivePaused: 0, pendingRelease: 0, available: 0, queue: 0 },
  );
  return { parts, totals, dataIssue: detectRestroomDataIssue(capacities, baselines) };
}

/**
 * 排队保护：分项基线必须满足 0 <= B <= N-O；排队 Q>0 时不得超过 N-O，
 * 否则界面显示数据异常并禁止分项保存。
 */
export function detectRestroomDataIssue(
  capacities: Record<RestroomPartKey, number>,
  baselines: Record<RestroomPartKey, PartBaseline>,
): string | undefined {
  const issues: string[] = [];
  for (const key of RESTROOM_PART_KEYS) {
    const total = capacities[key];
    const { occupied, queue, baselinePaused } = baselines[key];
    if (baselinePaused < 0 || baselinePaused > Math.max(0, total - occupied)) {
      issues.push(`分项 ${key} 的基础暂停数超出物理余量`);
    }
    if (queue > 0 && occupied + baselinePaused !== total) {
      issues.push(`分项 ${key} 存在排队却没有占满全部服务位`);
    }
  }
  return issues.length ? issues.join("；") : undefined;
}
