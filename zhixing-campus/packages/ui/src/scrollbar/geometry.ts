/** Platform-independent, CSS-pixel scrollbar geometry. */
export function thumbGeometry(viewport: number, content: number, track: number, position: number, minimum = 32) {
  const max = Math.max(0, content - viewport);
  const length = Math.min(Math.max(0, track), Math.max(minimum, content > 0 ? track * viewport / content : track));
  const travel = Math.max(0, track - length);
  const offset = max > 0 ? Math.min(max, Math.max(0, position)) / max * travel : 0;
  return { max, length, travel, offset };
}

export function scrollState(left: number, top: number, width: number, height: number, contentWidth: number, contentHeight: number) {
  const maxLeft = Math.max(0, contentWidth - width), maxTop = Math.max(0, contentHeight - height);
  return { left, top, maxLeft, maxTop, atLeft: left <= 1, atRight: left >= maxLeft - 1, atTop: top <= 1, atBottom: top >= maxTop - 1 };
}
export type ScrollState = ReturnType<typeof scrollState>;
