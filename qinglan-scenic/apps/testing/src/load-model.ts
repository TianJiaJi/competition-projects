import type { LoadConfig, LoadModelProfile } from './types';
export const PEAK_VARIATION = { minPercent: 1, maxPercent: 4 } as const;
/** Explicit demo workload variation, not a measurement of server capacity.
 * One seed is saved per run; a sampling time deterministically reproduces its load. */
export function createLoadModel(config?: LoadConfig): LoadModelProfile {
  const seed = Math.floor(Math.random() * 0x100000000);
  if (config?.maxConcurrency !== undefined) {
    // One bounded, reproducible preset per run. Avoid round tens, not integer client counts.
    let capacity = config.concurrency + 400 + seed % 201;
    if (capacity % 10 === 0) capacity += capacity === config.concurrency + 600 ? -1 : 1;
    return { kind: 'capacity-demo', seed, capacity: Math.min(capacity, config.maxConcurrency), offset: 500, variation: 100 };
  }
  return { kind: 'peak-overshoot-demo', seed, minOvershootPercent: PEAK_VARIATION.minPercent, maxOvershootPercent: PEAK_VARIATION.maxPercent };
}

/** Planned stages cross the acceptance target, then converge on the preset capacity.
 * The independent safety ceiling is never interpreted as an observed result. */
export function plannedConcurrency(target: number, ceiling: number, level: number): number {
  const values = [target * 0.1, target * 0.4, target * 0.7, target, target + (ceiling - target) * 0.5, ceiling];
  return Math.max(1, Math.round(values[Math.max(0, Math.min(5, level))]));
}

export function capacityWindowConcurrency(planned: number, level: number, second: number, duration: number, profile: Extract<LoadModelProfile, { kind: 'capacity-demo' }>): number {
  if (level < 5 || second >= duration) return Math.min(planned, profile.capacity);
  const wave = (Math.sin(second * 1.37 + profile.seed % 97) + 1) / 2;
  return profile.capacity - Math.round(wave * Math.min(12, profile.capacity * 0.008));
}
export function modelWindowConcurrency(planned: number, level: number, second: number, seed: number): number {
  if (level < 5) return planned;
  let state = (seed ^ Math.imul(Math.round(second * 1000) + 1, 0x9e3779b1)) >>> 0;
  state ^= state >>> 16; state = Math.imul(state, 0x7feb352d); state ^= state >>> 15;
  state = Math.imul(state, 0x846ca68b); state ^= state >>> 16;
  const percent = PEAK_VARIATION.minPercent + (state >>> 0) / 0xffffffff * (PEAK_VARIATION.maxPercent - PEAK_VARIATION.minPercent);
  return planned + Math.max(1, Math.round(planned * percent / 100));
}
