import { describe, expect, it } from "vitest";
import {
  RackWheelMotion,
  wheelPixels,
} from "../../packages/ui/src/record-rack/motion";

function finish(
  motion: RackWheelMotion,
  start: number,
  count: number,
  fps = 60,
  reduced = false,
) {
  const commits: number[] = [];
  for (let now = start; now < start + 2500; now += 1000 / fps) {
    const index = motion.advance(now, 1 / fps, count, 18, 180, 0.002, reduced);
    if (index !== null) commits.push(index);
  }
  return commits;
}
describe("唱片架滚轮导航", () => {
  it("触控板连续输入和惯性尾段结束前不提交，最终只提交一次", () => {
    const motion = new RackWheelMotion();
    let now = 0;
    for (const delta of [35, 32, 27, 24, 20, 16, 12, 9, 7, 5, 3, 2]) {
      motion.input(delta, 8, now, 100);
      expect(
        motion.advance(now + 16, 0.016, 8, 18, 180, 0.002, false),
      ).toBeNull();
      now += 40;
    }
    expect(finish(motion, now, 8)).toEqual([2]);
  });
  it("首尾阻力不产生越界或循环，单项保持零索引", () => {
    for (const count of [1, 4]) {
      const motion = new RackWheelMotion();
      motion.input(-2000, count, 0, 100);
      expect(motion.target).toBeGreaterThanOrEqual(-0.22);
      expect(finish(motion, 0, count)).toEqual([0]);
      motion.input(4000, count, 3000, 100);
      expect(finish(motion, 3000, count)).toEqual([count - 1]);
    }
  });
  it("30/60/120Hz和减少动态效果提交同一菜单", () => {
    for (const fps of [30, 60, 120])
      for (const reduced of [true, false]) {
        const motion = new RackWheelMotion(1);
        motion.input(170, 10, 0, 100);
        expect(finish(motion, 0, 10, fps, reduced)).toEqual([3]);
      }
  });
  it("取消待提交导航后，旧动量不会触发事件", () => {
    const motion = new RackWheelMotion();
    motion.input(100, 5, 0, 100);
    motion.pending = false;
    expect(finish(motion, 0, 5)).toEqual([]);
  });
  it("支持像素、行和页单位", () => {
    expect(wheelPixels(3, 0, 240)).toBe(3);
    expect(wheelPixels(3, 1, 240)).toBe(48);
    expect(wheelPixels(1, 2, 240)).toBe(240);
  });
});
