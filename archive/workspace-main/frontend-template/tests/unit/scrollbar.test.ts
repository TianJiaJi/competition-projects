import { describe, expect, it } from "vitest";
import {
  scrollState,
  thumbGeometry,
} from "../../packages/ui/src/scrollbar/geometry";
import { createUniScrollAdapter } from "../../packages/ui/src/scrollbar/uni";
describe("scrollbar geometry", () => {
  it("maps content position to proportional thumb movement", () => {
    expect(thumbGeometry(200, 1000, 200, 400)).toEqual({
      max: 800,
      length: 40,
      travel: 160,
      offset: 80,
    });
  });
  it("clamps bounce overscroll, tiny tracks and empty content", () => {
    expect(thumbGeometry(200, 10000, 100, -20).offset).toBe(0);
    expect(thumbGeometry(200, 10000, 100, 20000).offset).toBe(68);
    expect(thumbGeometry(20, 10000, 16, 800).length).toBe(16);
    expect(thumbGeometry(0, 0, 0, 0)).toEqual({
      max: 0,
      length: 0,
      travel: 0,
      offset: 0,
    });
  });
  it("reports fractional native-scroll boundaries with one pixel tolerance", () => {
    expect(scrollState(0, 799.6, 200, 200, 200, 1000)).toMatchObject({
      atLeft: true,
      atRight: true,
      atTop: false,
      atBottom: true,
      maxTop: 800,
    });
  });
});

it("native adapter measures bounds and reissues an identical programmatic destination after user scrolling", async () => {
  const writes: Array<{ left?: number; top?: number }> = [];
  const states: ReturnType<typeof scrollState>[] = [];
  const adapter = createUniScrollAdapter({
    writePosition: (p) => writes.push(p),
    nextTick: () => Promise.resolve(),
    measure: async () => ({
      width: 200,
      height: 200,
      contentWidth: 200,
      contentHeight: 1000,
    }),
    onScroll: (state) => states.push(state),
  });
  await adapter.update();
  expect(states.at(-1)).toMatchObject({ maxTop: 800, atTop: true });
  adapter.onNativeScroll({
    scrollLeft: 0,
    scrollTop: 150,
    scrollWidth: 200,
    scrollHeight: 1000,
  });
  await adapter.scrollTo({ top: 500 });
  expect(writes.slice(-2)).toEqual([
    { left: 0, top: 150 },
    { left: 0, top: 500 },
  ]);
  adapter.onNativeScroll({
    scrollLeft: 0,
    scrollTop: 200,
    scrollWidth: 200,
    scrollHeight: 1000,
  });
  await adapter.scrollTo({ top: 500 });
  expect(writes.slice(-2)).toEqual([
    { left: 0, top: 200 },
    { left: 0, top: 500 },
  ]);
});
