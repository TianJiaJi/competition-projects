export interface ChartAxis {
  max: number;
  step: number;
  ticks: number[];
}

/** Round the axis domain, never the labels at arbitrary fractional positions. */
export function chartAxis(maximum: number, integers = false): ChartAxis {
  const value = Number.isFinite(maximum) && maximum > 0 ? maximum : 1;
  const rawStep = value / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const fraction = rawStep / magnitude;
  const factor = [1, 2, 2.5, 5, 10].find(candidate => candidate >= fraction) || 10;
  const step = Number((integers ? Math.max(1, Math.ceil(factor * magnitude)) : factor * magnitude).toPrecision(12));
  const intervals = Math.ceil(value / step - 1e-10);
  const ticks = Array.from({ length: intervals + 1 }, (_, index) => Number((index * step).toPrecision(12)));
  return { max: ticks.at(-1)!, step, ticks };
}

export function timeTicks(duration: number): number[] {
  const ticks = chartAxis(duration, true).ticks.filter(tick => tick <= duration);
  if (ticks.at(-1) !== duration) {
    // Avoid two near-identical labels at the right edge on non-round durations.
    if (ticks.length > 1 && duration - ticks.at(-1)! < (ticks[1] - ticks[0]) * .5) ticks.pop();
    ticks.push(duration);
  }
  return ticks;
}

export function formatAxisTick(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
}
