import { describe, expect, it } from "vitest";
import { rackSpacing } from "../../packages/ui/src/record-rack/spacing";
describe("唱片架单屏密度", () => {
  it("铺满模式下七张后台唱片随屏幕高度伸展，保留上下安全边距", () => {
    for (const height of [768, 900, 1080]) {
      const step = rackSpacing(7, 8, height, 240, 48, 4, 0, true);
      expect(5 * step + 480 - 28).toBeCloseTo(height - 8);
    }
  });
  it("低于上限75%保持原间距，接近上限时逐步铺开，满屏不超出边界", () => {
    expect(rackSpacing(4, 8, 1000, 240, 62, 18, 0)).toBe(62);
    expect(rackSpacing(6, 8, 1000, 240, 62, 18, 0)).toBeGreaterThan(62);
    const full = rackSpacing(8, 8, 1000, 240, 62, 18, 0);
    expect(6 * full + 480 - 28).toBeCloseTo(924);
    expect(rackSpacing(17, 8, 1000, 240, 62, 18, 0)).toBe(full);
  });
  it("小视口不挤压最小间距，保留滚动；大视口仍保留重叠", () => {
    expect(rackSpacing(8, 8, 600, 240, 62, 18, 0)).toBe(62);
    expect(rackSpacing(8, 8, 3000, 240, 62, 18, 0)).toBe(212);
  });
});
