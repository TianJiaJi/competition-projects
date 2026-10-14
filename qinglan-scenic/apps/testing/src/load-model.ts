import type { LoadModelProfile } from './types';
export const PEAK_VARIATION = { minPercent: 1, maxPercent: 4 } as const;
/** Explicit demo workload variation, not a measurement of server capacity.
 * One seed is saved per run; a sampling time deterministically reproduces its load. */
export function createLoadModel(): LoadModelProfile {
  return { kind: 'peak-overshoot-demo', seed: Math.floor(Math.random() * 0x100000000), minOvershootPercent: PEAK_VARIATION.minPercent, maxOvershootPercent: PEAK_VARIATION.maxPercent };
}
export function modelWindowConcurrency(planned: number, level: number, second: number, seed: number): number {
  if (level < 5) return planned;
  let state = (seed ^ Math.imul(Math.round(second * 1000) + 1, 0x9e3779b1)) >>> 0;
  state ^= state >>> 16; state = Math.imul(state, 0x7feb352d); state ^= state >>> 15;
  state = Math.imul(state, 0x846ca68b); state ^= state >>> 16;
  const percent = PEAK_VARIATION.minPercent + (state >>> 0) / 0xffffffff * (PEAK_VARIATION.maxPercent - PEAK_VARIATION.minPercent);
  return planned + Math.max(1, Math.round(planned * percent / 100));
}
