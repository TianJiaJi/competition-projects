/** Native uni-app entry: no DOM or Vue runtime. SFC shells must live inside uni-app's src. */
import { scrollState, type ScrollState } from './geometry';
export { scrollState, thumbGeometry } from './geometry';
export type { ScrollState } from './geometry';
export type { ScrollDirection, ScrollTheme, ScrollVisibility } from './types';

export interface NativePosition { left?: number; top?: number }
export interface NativeScrollDetail { scrollLeft: number; scrollTop: number; scrollWidth: number; scrollHeight: number }
export interface NativeViewport { width: number; height: number; contentWidth: number; contentHeight: number }
export function createUniScrollAdapter(options: {
  writePosition(position: NativePosition): void;
  nextTick(): Promise<unknown>;
  measure(): Promise<NativeViewport>;
  onScroll(state: ScrollState): void;
}) {
  let left = 0, top = 0, width = 0, height = 0, contentWidth = 0, contentHeight = 0;
  const report = () => options.onScroll(scrollState(left, top, width, height, contentWidth, contentHeight));
  let request = 0;
  const scrollTo = async (position: NativePosition) => {
    const revision = ++request;
    options.writePosition({ left, top });
    await options.nextTick();
    if (revision !== request) return;
    options.writePosition({ left: position.left === undefined ? left : Math.max(0, position.left), top: position.top === undefined ? top : Math.max(0, position.top) });
  };
  return {
    scrollTo,
    scrollBy: (position: NativePosition) => scrollTo({ left: left + (position.left || 0), top: top + (position.top || 0) }),
    async update() { const size = await options.measure(); ({ width, height, contentWidth, contentHeight } = size); report(); },
    onNativeScroll(detail: NativeScrollDetail) { left = detail.scrollLeft; top = detail.scrollTop; contentWidth = detail.scrollWidth; contentHeight = detail.scrollHeight; report(); },
  };
}
