/** Suppress browser zoom without consuming mouse, pen, single-touch or map gestures. */
export function installTouchInteractions(target: Document = document) {
  const controller = new AbortController();
  const options = { capture: true, passive: false, signal: controller.signal };
  target.addEventListener('wheel', event => {
    // Trackpad pinch is exposed as ctrl+wheel. OrbitControls still receives it on canvas.
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  }, options);
  target.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '0', 'Add', 'Subtract'].includes(event.key))
      event.preventDefault();
  }, options);
  target.addEventListener('dblclick', event => event.preventDefault(), options);
  for (const name of ['gesturestart', 'gesturechange', 'gestureend'])
    target.addEventListener(name, event => event.preventDefault(), options);
  target.addEventListener('touchmove', event => {
    // Keep the map's two-finger dolly; all UI remains operable with one finger.
    if (event.touches.length > 1 && !(event.target instanceof Element && event.target.closest('.scene-canvas')))
      event.preventDefault();
  }, options);
  return () => controller.abort();
}
