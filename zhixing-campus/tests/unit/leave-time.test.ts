import { expect, it } from 'vitest';
import { leaveBounds, formatLeaveDuration, formatLeaveRange, validLeaveTime } from '../../packages/bookings/src/leave';
it('严格校验时分秒并计算精确持续时间', () => {
  for (const time of ['00:00:00', '12:34:56', '23:59:59']) expect(validLeaveTime(time)).toBe(true);
  for (const time of ['24:00:00', '12:60:00', '12:00:60', '1:02:03', '12:30', '']) expect(validLeaveTime(time)).toBe(false);
  const interval = leaveBounds({ startDate: '2026-10-14', startTime: '08:10:15', endDate: '2026-10-15', endTime: '10:30:20' });
  expect(formatLeaveDuration(interval.end - interval.start)).toBe('1 天 2 小时 20 分钟 5 秒');
  expect(formatLeaveDuration(1000)).toBe('1 秒');
  expect(formatLeaveDuration(0)).toBe('');
  expect(formatLeaveRange({ startDate: '2026-10-14', startTime: '08:10:15', endDate: '2026-10-15', endTime: '10:30:20' })).toContain('08:10:15 — 2026-10-15 10:30:20');
});
it('旧半天记录保留整段含义且兼容展示', () => {
  const old = { startDate: '2026-10-14', startPeriod: '下午' as const, endDate: '2026-10-15', endPeriod: '上午' as const };
  const interval = leaveBounds(old);
  expect(formatLeaveDuration(interval.end - interval.start)).toBe('1 天');
  expect(formatLeaveRange(old)).toBe('2026-10-14 12:00:00 — 2026-10-15 11:59:59');
});
