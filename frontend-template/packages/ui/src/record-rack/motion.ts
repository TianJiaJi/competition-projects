export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export function finite(value: number | undefined, fallback: number, min: number, max: number) {
  return clamp(Number.isFinite(value) ? value! : fallback, min, max);
}
export function wheelPixels(delta: number, mode: number, pageSize: number) {
  return delta * (mode === 1 ? 16 : mode === 2 ? pageSize : 1);
}
/** Frame-rate independent damped motion. Overscroll is visual only; committed indices remain bounded. */
export class RackWheelMotion {
  position: number;
  target: number;
  lastInput = 0;
  pending = false;
  constructor(index = 0) { this.position = this.target = index; }
  input(delta: number, count: number, now: number, step: number) {
    if (!count) return;
    const raw = this.target + delta / step;
    const bounded = clamp(raw, 0, count - 1);
    this.target = bounded + clamp((raw - bounded) * 0.16, -0.22, 0.22);
    this.lastInput = now;
    this.pending = true;
  }
  advance(now: number, dt: number, count: number, damping: number, delay: number, epsilon: number, reduced: boolean) {
    const resting = now - this.lastInput >= delay;
    if (resting) this.target = clamp(Math.round(this.target), 0, Math.max(0, count - 1));
    this.position = reduced ? this.target : this.position + (this.target - this.position) * (1 - Math.exp(-damping * Math.min(dt, 0.064)));
    if (resting && Math.abs(this.position - this.target) <= epsilon) {
      this.position = this.target;
      if (this.pending) { this.pending = false; return this.target; }
    }
    return null;
  }
}
