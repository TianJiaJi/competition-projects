import { describe, expect, it } from 'vitest';
import { chartAxis, formatAxisTick, timeTicks } from '../../apps/testing/src/chart-axis';

describe('压力图表刻度', () => {
  it('小并发使用真实整数刻度，而非把1.25、2.5、3.75直接取整', () => {
    expect(chartAxis(5, true).ticks).toEqual([0, 1, 2, 3, 4, 5]);
    expect(chartAxis(3, true).ticks).toEqual([0, 1, 2, 3]);
    expect(chartAxis(1, true).ticks).toEqual([0, 1]);
  });
  it('延迟和吞吐轴使用规整间距，覆盖峰值', () => {
    expect(chartAxis(250).ticks).toEqual([0, 50, 100, 150, 200, 250]);
    expect(chartAxis(200).ticks).toEqual([0, 50, 100, 150, 200]);
    expect(chartAxis(120).ticks).toEqual([0, 25, 50, 75, 100, 125]);
    expect(chartAxis(1000, true).ticks).toEqual([0, 200, 400, 600, 800, 1000]);
  });
  it.each([0, 1, 5, 7, 11, 120, 251, 999, 1200, 50000, .8, NaN, Infinity])('刻度不重复且等距：%s', maximum => {
    const axis = chartAxis(maximum);
    expect(axis.ticks[0]).toBe(0);
    expect(axis.max).toBeGreaterThanOrEqual(Number.isFinite(maximum) ? maximum : 1);
    expect(new Set(axis.ticks.map(formatAxisTick)).size).toBe(axis.ticks.length);
    for (let index = 1; index < axis.ticks.length; index++) {
      expect(axis.ticks[index] - axis.ticks[index - 1]).toBeCloseTo(axis.step, 8);
    }
  });
  it('时间轴保留真实的起止时间，不再将2.5秒标签四舍五入为3秒', () => {
    expect(timeTicks(10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(timeTicks(11)).toEqual([0, 3, 6, 9, 11]);
    expect(timeTicks(10.5)).toEqual([0, 3, 6, 9, 10.5]);
    expect(timeTicks(12.2)).toEqual([0, 3, 6, 9, 12.2]);
  });
  it('数值格式移除浮点尾数并统一千位分隔', () => {
    expect(formatAxisTick(1000)).toBe('1,000');
    expect(formatAxisTick(.1 + .2)).toBe('0.3');
  });
});
