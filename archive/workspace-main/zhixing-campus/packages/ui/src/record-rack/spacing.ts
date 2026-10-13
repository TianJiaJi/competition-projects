/** Progressively fill the viewport near the page limit, preserving overlap and the configured minimum. */
export function rackSpacing(count: number, limit: number, axis: number, size: number, base: number, edge: number, title: number, fill = false) {
  const visible = Math.min(count, limit);
  const threshold = Math.ceil(limit * .75);
  if ((!fill && visible < threshold) || visible <= 2) return base;
  const available = axis - edge * 2 - (fill ? 0 : 40);
  // With one expanded sleeve: (n - 2) * spacing + 2 * size - overlap + title.
  const fitted = Math.max(base, Math.min(size - 28, (available - 2 * size + 28 - title) / (visible - 2)));
  if (fill) return fitted;
  const progress = Math.min(1, (visible - threshold + 1) / (limit - threshold + 1));
  return base + (fitted - base) * progress;
}
