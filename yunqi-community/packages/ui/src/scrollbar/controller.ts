import {displayScale,layoutViewport,layoutRect,DISPLAY_CHANGE} from '../display';
import { scrollState, thumbGeometry } from './geometry';
import type { ScrollbarController, ScrollbarOptions } from './types';
import './scrollbar.css';

const controllers = new WeakMap<HTMLElement, ScrollbarController>();
let nextId = 0;
const variables = ['--brand', '--ink', '--surface', '--canvas', '--muted', '--scrollbar-size', '--scrollbar-hit-size', '--scrollbar-inset', '--scrollbar-thumb-color', '--scrollbar-focus-color', '--scrollbar-z-index', '--glass-tint-rgb', '--glass-border'];

/** Attach without wrapping/replacing the native scroll element. Call destroy on unmount. */
export function attachScrollbar(element: HTMLElement, options: ScrollbarOptions = {}): ScrollbarController {
  const existing = controllers.get(element);
  if (existing) return existing;
  const page = element === document.scrollingElement;
  const overlay = document.createElement('div');
  overlay.className = 'sg-scroll-overlay';
  overlay.dataset.visible = 'false';
  const originalId = element.id;
  const originalTabindex = element.getAttribute('tabindex');
  if (!element.id) element.id = `sg-viewport-${++nextId}`;
  const generatedId = element.id;
  if (!page && !element.hasAttribute('tabindex')) element.tabIndex = 0;
  element.classList.add('sg-scroll-host');
  document.body.append(overlay);
  const abort = new AbortController();
  const listen = (target: EventTarget, event: string, fn: EventListener, capture = false) => target.addEventListener(event, fn, { signal: abort.signal, capture });
  let hovered = false, focused = false, dragging = false, disposed = false;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let hasVisibleTrack = false;
  const axisNodes = (['x', 'y'] as const).map(axis => {
    const track = document.createElement('div'), thumb = document.createElement('div');
    track.className = 'sg-scroll-track'; thumb.className = 'sg-scroll-thumb';
    track.dataset.axis = axis;
    track.setAttribute('role', 'scrollbar'); track.tabIndex = 0;
    track.setAttribute('aria-controls', element.id);
    track.setAttribute('aria-orientation', axis === 'y' ? 'vertical' : 'horizontal');
    track.setAttribute('aria-label', `${options.label || element.getAttribute('aria-label') || '内容滚动'}${axis === 'y' ? '（纵向）' : '（横向）'}`);
    track.setAttribute('aria-valuemin', '0');
    track.append(thumb); overlay.append(track);
    return { axis, track, thumb, geometry: thumbGeometry(0, 0, 0, 0) };
  });
  const state = () => scrollState(element.scrollLeft, element.scrollTop, page ? document.documentElement.clientWidth : element.clientWidth, page ? document.documentElement.clientHeight : element.clientHeight, element.scrollWidth, element.scrollHeight);
  const scroll = (axis: 'x' | 'y', position: number) => element.scrollTo(axis === 'y' ? { top: position, behavior: 'instant' } : { left: position, behavior: 'instant' });
  function update() {
    if (disposed) return;
    const style = getComputedStyle(element), s = state();
    const rect = page ? { left: 0, top: 0, width: document.documentElement.clientWidth, height: document.documentElement.clientHeight } : layoutRect(element);
    const left = rect.left + (page ? 0 : element.clientLeft), top = rect.top + (page ? 0 : element.clientTop);
    const width = page ? rect.width : element.clientWidth, height = page ? rect.height : element.clientHeight;
    Object.assign(overlay.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    let clipLeft = Math.max(0, -left), clipTop = Math.max(0, -top), clipRight = Math.max(0, left + width - layoutViewport().width), clipBottom = Math.max(0, top + height - layoutViewport().height);
    for (let parent = element.parentElement; parent && !page; parent = parent.parentElement) {
      const ps = getComputedStyle(parent), pr = layoutRect(parent);
      if (/(auto|scroll|hidden|clip)/.test(ps.overflowX)) { clipLeft = Math.max(clipLeft, pr.left - left); clipRight = Math.max(clipRight, left + width - pr.right); }
      if (/(auto|scroll|hidden|clip)/.test(ps.overflowY)) { clipTop = Math.max(clipTop, pr.top - top); clipBottom = Math.max(clipBottom, top + height - pr.bottom); }
    }
    overlay.style.clipPath = `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px)`;
    const hidden = !element.isConnected || !element.getClientRects().length || !!element.closest('[inert], [aria-hidden="true"]') || style.visibility === 'hidden';
    overlay.style.display = hidden ? 'none' : '';
    const portal = element.closest('dialog[open], [popover]:popover-open') || document.body;
    if (overlay.parentElement !== portal) portal.append(overlay);
    const themeHost = element.closest('[data-theme]') || document.querySelector('[data-theme]:not(.sg-scroll-overlay)');
    overlay.dataset.theme = options.theme && options.theme !== 'auto' ? options.theme : themeHost?.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    for (const variable of variables) {
      const value = style.getPropertyValue(variable).trim();
      if (value) overlay.style.setProperty(variable, value); else overlay.style.removeProperty(variable);
    }
    const direction = options.direction || 'both';
    const bodyStyle = page ? getComputedStyle(document.body) : style;
    const xLocked = page && (/hidden|clip/.test(style.overflowX) || /hidden|clip/.test(bodyStyle.overflowX));
    const yLocked = page && (/hidden|clip/.test(style.overflowY) || /hidden|clip/.test(bodyStyle.overflowY));
    const x = !xLocked && direction !== 'vertical' && s.maxLeft > 1 && (page || /auto|scroll/.test(style.overflowX));
    const y = !yLocked && direction !== 'horizontal' && s.maxTop > 1 && (page || /auto|scroll/.test(style.overflowY));
    hasVisibleTrack = !hidden && (x || y);
    const hit = parseFloat(getComputedStyle(overlay).getPropertyValue('--scrollbar-hit-size')) || (matchMedia('(pointer: coarse)').matches ? 24 : 14);
    for (const node of axisNodes) {
      const vertical = node.axis === 'y';
      node.track.hidden = !(vertical ? y : x);
      const extent = Math.max(0, (vertical ? height : width) - ((vertical ? x : y) ? hit : 0) - 4);
      node.geometry = thumbGeometry(vertical ? height : width, vertical ? element.scrollHeight : element.scrollWidth, extent, vertical ? s.top : s.left);
      Object.assign(node.track.style, vertical ? { top: '2px', height: `${extent}px` } : { left: '2px', width: `${extent}px` });
      Object.assign(node.thumb.style, vertical ? { height: `${node.geometry.length}px`, transform: `translateY(${node.geometry.offset}px)` } : { width: `${node.geometry.length}px`, transform: `translateX(${node.geometry.offset}px)` });
      node.track.setAttribute('aria-valuemax', String(Math.round(node.geometry.max)));
      node.track.setAttribute('aria-valuenow', String(Math.round(Math.max(0, Math.min(node.geometry.max, vertical ? s.top : s.left)))));
      // A body portal must never float above unrelated menus, modals or fixed navigation.
      const px = vertical ? left + width - hit / 2 : left + width / 2;
      const py = vertical ? top + height / 2 : top + height - hit / 2;
      const front = document.elementsFromPoint(px*displayScale(), py*displayScale()).find(item => !item.closest('.sg-scroll-overlay'));
      const obscured = front && (!element.contains(front) || (page && !!front.closest('dialog[open], [aria-modal="true"]')));
      node.track.style.visibility = obscured ? 'hidden' : '';
    }
  }
  function tick() {
    frame = 0; update();
    if (!disposed && hasVisibleTrack && overlay.dataset.visible === 'true' && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function schedule() { if (!frame && !disposed) frame = requestAnimationFrame(tick); }
  function show() {
    clearTimeout(hideTimer); overlay.dataset.visible = 'true'; schedule();
    hideTimer = setTimeout(() => {
      if (!dragging && !(options.visibility !== 'scroll' && (hovered || focused)) && options.visibility !== 'always') overlay.dataset.visible = 'false';
    }, 800);
  }
  for (const node of axisNodes) {
    let start = 0, initial = 0, pointer = -1;
    listen(node.track, 'pointerdown', event => {
      const e = event as PointerEvent;
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); update();
      const vertical = node.axis === 'y';
      const rect = node.track.getBoundingClientRect();
      const point = (vertical ? e.clientY - rect.top : e.clientX - rect.left)/displayScale();
      if (point >= node.geometry.offset && point <= node.geometry.offset + node.geometry.length) {
        dragging = true; pointer = e.pointerId; start = vertical ? e.clientY : e.clientX; initial = vertical ? element.scrollTop : element.scrollLeft;
        node.track.setPointerCapture(pointer);
      } else {
        scroll(node.axis, (vertical ? element.scrollTop : element.scrollLeft) + (point < node.geometry.offset ? -1 : 1) * (vertical ? element.clientHeight : element.clientWidth));
      }
      show();
    });
    listen(node.track, 'pointermove', event => {
      const e = event as PointerEvent;
      if (!dragging || e.pointerId !== pointer) return;
      const delta = ((node.axis === 'y' ? e.clientY : e.clientX) - start)/displayScale();
      scroll(node.axis, initial + (node.geometry.travel > 0 ? delta / node.geometry.travel * node.geometry.max : 0));
    });
    const end = () => { if (pointer < 0) return; dragging = false; pointer = -1; show(); };
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(node.track, event, end);
    listen(node.track, 'keydown', event => {
      const e = event as KeyboardEvent, vertical = node.axis === 'y';
      const current = vertical ? element.scrollTop : element.scrollLeft, size = vertical ? element.clientHeight : element.clientWidth;
      let next: number | undefined;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = node.geometry.max;
      if (e.key === 'PageDown' || e.key === ' ') next = current + size * (e.shiftKey ? -1 : 1);
      if (e.key === 'PageUp') next = current - size;
      if (e.key === (vertical ? 'ArrowDown' : 'ArrowRight')) next = current + 40;
      if (e.key === (vertical ? 'ArrowUp' : 'ArrowLeft')) next = current - 40;
      if (next !== undefined) { e.preventDefault(); scroll(node.axis, next); show(); }
    });
    node.track.addEventListener('wheel', event => {
      if (event.ctrlKey) return; // Preserve trackpad pinch/browser zoom.
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
      const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
      for (let host: HTMLElement | null = element; host; host = host.parentElement) {
        const hs = getComputedStyle(host);
        const s = scrollState(host.scrollLeft, host.scrollTop, host.clientWidth, host.clientHeight, host.scrollWidth, host.scrollHeight);
        const documentHost = host === document.scrollingElement;
        const body = documentHost ? getComputedStyle(document.body) : hs;
        const canY = !/hidden|clip/.test(hs.overflowY) && !/hidden|clip/.test(body.overflowY) && (/auto|scroll/.test(hs.overflowY) || documentHost);
        const canX = !/hidden|clip/.test(hs.overflowX) && !/hidden|clip/.test(body.overflowX) && (/auto|scroll/.test(hs.overflowX) || documentHost);
        const consumes = (canY && ((dy < 0 && !s.atTop) || (dy > 0 && !s.atBottom))) || (canX && ((dx < 0 && !s.atLeft) || (dx > 0 && !s.atRight)));
        if (consumes) { event.preventDefault(); host.scrollBy({ left: dx * scale, top: dy * scale, behavior: 'instant' }); show(); return; }
        if ((dy && /contain|none/.test(hs.overscrollBehaviorY)) || (dx && /contain|none/.test(hs.overscrollBehaviorX))) { event.preventDefault(); return; }
      }
    }, { passive: false, signal: abort.signal });
  }
  for (const host of [element, overlay]) {
    listen(host, 'pointerenter', event => { if ((event as PointerEvent).pointerType !== 'touch') { hovered = true; if (options.visibility !== 'scroll') show(); } });
    listen(host, 'pointerleave', event => { const related = (event as PointerEvent).relatedTarget as Node | null; hovered = !!related && (element.contains(related) || overlay.contains(related)); if (options.visibility !== 'scroll' || overlay.dataset.visible === 'true') show(); });
    listen(host, 'focusin', () => { focused = true; show(); });
    listen(host, 'focusout', event => { const related = (event as FocusEvent).relatedTarget as Node | null; focused = !!related && (element.contains(related) || overlay.contains(related)); show(); });
  }
  listen(page ? document : element, 'scroll', () => { show(); options.onScroll?.(state()); });
  listen(window, 'scroll', schedule, true); listen(window, 'resize', schedule); listen(window, DISPLAY_CHANGE, schedule);
  listen(document, 'visibilitychange', schedule);
  listen(element, 'load', schedule, true);
  const resize = new ResizeObserver(schedule);
  resize.observe(element);
  const observeChildren = () => { resize.disconnect(); resize.observe(element); for (const child of Array.from(element.children)) if (!child.classList.contains('sg-scroll-overlay')) resize.observe(child); };
  observeChildren();
  const mutation = new MutationObserver(records => {
    if (records.every(record => (record.target as Element).closest?.('.sg-scroll-overlay, [data-scrollbar="off"]'))) return;
    observeChildren(); schedule();
  });
  mutation.observe(element, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  const controller: ScrollbarController = {
    element, update,
    scrollTo: value => element.scrollTo(value), scrollBy: value => element.scrollBy(value),
    destroy() {
      if (disposed) return; disposed = true; abort.abort(); resize.disconnect(); mutation.disconnect(); clearTimeout(hideTimer); cancelAnimationFrame(frame); overlay.remove();
      element.classList.remove('sg-scroll-host');
      if (!originalId && element.id === generatedId) element.removeAttribute('id');
      if (originalTabindex === null && element.getAttribute('tabindex') === '0') element.removeAttribute('tabindex');
      controllers.delete(element);
    },
  };
  controllers.set(element, controller); update();
  if (options.visibility === 'always') show();
  return controller;
}

/** Incremental application migration: discovers native overflow containers, including dynamic menus. */
export function installScrollbars(root: HTMLElement = document.body): () => void {
  const owned = new Map<HTMLElement, ScrollbarController>();
  const pending = new Set<Element>([root]);
  let frame = 0;
  const scan = () => {
    frame = 0;
    const candidates = new Set<Element | null>([document.scrollingElement]);
    for (const changed of pending) {
      if (!changed.isConnected) continue;
      candidates.add(changed);
      for (const child of Array.from(changed.querySelectorAll('*'))) candidates.add(child);
    }
    pending.clear();
    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement) || candidate.closest('.sg-scroll-overlay, [data-scrollbar="off"]') || /^(TEXTAREA|INPUT|SELECT|OPTION)$/.test(candidate.tagName)) continue;
      const style = getComputedStyle(candidate);
      if (candidate !== document.scrollingElement && !/(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`)) continue;
      // body overflow is propagated to the viewport unless it has an independent scroll range.
      if (candidate === document.body && candidate !== document.scrollingElement && candidate.scrollHeight <= candidate.clientHeight) continue;
      if (!controllers.has(candidate)) owned.set(candidate, attachScrollbar(candidate));
    }
    for (const [host, controller] of owned) {
      const style = getComputedStyle(host);
      if (!host.isConnected || host.closest('[data-scrollbar="off"]') || (host !== document.scrollingElement && !/(auto|scroll)/.test(`${style.overflowX} ${style.overflowY}`))) { controller.destroy(); owned.delete(host); } else controller.update();
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(scan); };
  const observer = new MutationObserver(records => {
    let relevant = false;
    for (const record of records) {
      if ((record.target as Element).closest?.('.sg-scroll-overlay, [data-scrollbar="off"]')) continue;
      if (record.type === 'childList') {
        for (const node of Array.from(record.addedNodes)) if (node instanceof Element && !node.classList.contains('sg-scroll-overlay')) { pending.add(node); relevant = true; }
        if (Array.from(record.removedNodes).some(node => node instanceof Element && !node.classList.contains('sg-scroll-overlay'))) relevant = true;
      } else if (record.target instanceof Element) { pending.add(record.target); relevant = true; }
    }
    if (relevant) schedule();
  });
  scan(); observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'data-theme', 'data-scrollbar', 'inert', 'aria-hidden'] });
  const resize = () => { pending.add(root); schedule(); };
  window.addEventListener('resize', resize);window.addEventListener(DISPLAY_CHANGE,resize);
  return () => { observer.disconnect(); window.removeEventListener('resize', resize);window.removeEventListener(DISPLAY_CHANGE,resize); cancelAnimationFrame(frame); for (const controller of owned.values()) controller.destroy(); owned.clear(); };
}
