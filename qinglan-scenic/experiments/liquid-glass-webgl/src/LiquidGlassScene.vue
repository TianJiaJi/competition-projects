<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue';
import { finiteClamp, glassContextKey, type GlassRegistration, type GlassStatus } from './context';
import { buttonConfig, uploadWallpaper } from './renderer-adapter';
import type { LiquidGlassRenderer } from './vendor/renderer';

const props = withDefaults(defineProps<{ background?: string; disabled?: boolean; maxDpr?: number }>(), {
  background: '', disabled: false, maxDpr: 1.5,
});
const emit = defineEmits<{ status: [value: GlassStatus]; error: [error: Error] }>();
const host = ref<HTMLDivElement>();
const canvas = ref<HTMLCanvasElement>();
const content = ref<HTMLDivElement>();
const status = shallowRef<GlassStatus>('fallback');
const backgroundStyle = computed(() => ({ backgroundImage: props.background ? `url(${JSON.stringify(props.background)})` : undefined }));
const entries = new Map<string, GlassRegistration>();
let renderer: LiquidGlassRenderer | undefined;
let resizeObserver: ResizeObserver | undefined;
let mutationObserver: MutationObserver | undefined;
let motion: MediaQueryList | undefined;
let forcedColors: MediaQueryList | undefined;
let frame = 0;
let generation = 0;
let mounted = false;
let cancelImage: (() => void) | undefined;

function setStatus(value: GlassStatus) {
  if (status.value !== value) { status.value = value; emit('status', value); }
}
function pause() {
  if (!renderer) return;
  if (renderer.rafId !== null) cancelAnimationFrame(renderer.rafId);
  if (renderer.animRafId !== null) cancelAnimationFrame(renderer.animRafId);
  renderer.rafId = renderer.animRafId = null;
  for (const state of renderer.buttonStates.values()) {
    state.pressProgress = state.pressVelocity = state.targetPress = 0;
    state.dragX = state.targetDragX = state.startDragX;
    state.dragY = state.targetDragY = state.startDragY;
    state.dragVx = state.dragVy = 0;
  }
  renderer.markAllDirty();
}
function stop() {
  generation++;
  cancelImage?.(); cancelImage = undefined;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  renderer?.dispose(); renderer = undefined;
  setStatus('fallback');
}
function fail(error: unknown) {
  stop();
  emit('error', error instanceof Error ? error : new Error(String(error)));
}
function refresh() {
  if (!mounted || frame || document.hidden) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const current = renderer;
    if (!current || !host.value || !current.wallpaperReady) return;
    try {
      const bounds = host.value.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) { pause(); return; }
      const dpr = Math.min(window.devicePixelRatio || 1, finiteClamp(props.maxDpr, 1.5, 0.5, 2));
      if (current.cssWidth !== bounds.width || current.cssHeight !== bounds.height || current.dpr !== dpr) {
        current.dpr = dpr;
        current.resize(bounds.width, bounds.height);
      }
      const configs = [...entries].flatMap(([id, entry]) => {
        const rect = entry.element.getBoundingClientRect();
        const options = entry.options();
        if (options.disabled || rect.width < 1 || rect.height < 1 || getComputedStyle(entry.element).visibility === 'hidden') return [];
        return [buttonConfig(id, { x: rect.left - bounds.left, y: rect.top - bounds.top, w: rect.width, h: rect.height }, options)];
      });
      current.setElements(configs);
      current.render();
      if (renderer === current) setStatus('webgl');
    } catch (error) { fail(error); }
  });
}
async function start() {
  stop();
  if (!mounted || !canvas.value || props.disabled || !props.background || forcedColors?.matches) return;
  const token = generation;
  const target = canvas.value;
  const src = props.background;
  setStatus('loading');
  try {
    const { LiquidGlassRenderer } = await import('./vendor/renderer');
    if (!mounted || token !== generation) return;
    const current = new LiquidGlassRenderer(target);
    renderer = current;
    // One context per scene; element caches reuse static glass instead of redrawing at idle.
    current.quickToggles.perElementFbo = true;
    const render = current.render.bind(current);
    current.render = () => {
      if (!mounted || renderer !== current || document.hidden) return;
      try { render(); } catch (error) { fail(error); }
    };
    const image = new Image();
    image.crossOrigin = 'anonymous';
    cancelImage = () => { image.onload = image.onerror = null; image.src = ''; };
    image.onload = () => {
      image.onload = image.onerror = null; cancelImage = undefined;
      if (!mounted || token !== generation || renderer !== current) return;
      try { uploadWallpaper(current, image); refresh(); } catch (error) { fail(error); }
    };
    image.onerror = () => {
      if (token === generation) fail(new Error('玻璃背景加载失败，请检查路径与跨域 CORS 响应头'));
    };
    image.src = src;
  } catch (error) {
    if (token === generation) fail(error);
  }
}
function point(event?: PointerEvent) {
  if (!event || !host.value) return undefined;
  const bounds = host.value.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}
provide(glassContextKey, {
  status,
  register(id, entry) { entries.set(id, entry); resizeObserver?.observe(entry.element); refresh(); },
  unregister(id) { const entry = entries.get(id); if (entry) resizeObserver?.unobserve(entry.element); entries.delete(id); refresh(); },
  refresh,
  press(id, pressed, event) {
    if (!renderer || status.value !== 'webgl' || motion?.matches || document.hidden) return;
    renderer.setPressed(id, pressed, point(event));
  },
  drag(id, event) {
    if (!renderer || motion?.matches || document.hidden) return;
    const position = point(event);
    if (position) renderer.setDragPosition(id, position);
  },
});
function visibilityChanged() { if (document.hidden) pause(); else refresh(); }
function motionChanged() { pause(); refresh(); }
function contextLost(event: Event) { event.preventDefault(); fail(new Error('WebGL 上下文丢失，已切换磨砂效果')); }
watch(() => [props.background, props.disabled], () => { if (mounted) void start(); });
watch(() => props.maxDpr, refresh);
onMounted(() => {
  mounted = true;
  resizeObserver = new ResizeObserver(refresh);
  if (host.value) resizeObserver.observe(host.value);
  for (const entry of entries.values()) resizeObserver.observe(entry.element);
  mutationObserver = new MutationObserver(refresh);
  if (content.value) mutationObserver.observe(content.value, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  forcedColors = window.matchMedia('(forced-colors: active)');
  motion.addEventListener('change', motionChanged);
  forcedColors.addEventListener('change', start);
  window.addEventListener('resize', refresh);
  window.addEventListener('scroll', refresh, true);
  document.addEventListener('visibilitychange', visibilityChanged);
  canvas.value?.addEventListener('webglcontextlost', contextLost);
  canvas.value?.addEventListener('webglcontextrestored', start);
  void start();
});
onBeforeUnmount(() => {
  const gl = renderer?.gl;
  mounted = false; stop();
  resizeObserver?.disconnect(); mutationObserver?.disconnect(); entries.clear();
  motion?.removeEventListener('change', motionChanged);
  forcedColors?.removeEventListener('change', start);
  window.removeEventListener('resize', refresh);
  window.removeEventListener('scroll', refresh, true);
  document.removeEventListener('visibilitychange', visibilityChanged);
  canvas.value?.removeEventListener('webglcontextlost', contextLost);
  canvas.value?.removeEventListener('webglcontextrestored', start);
  // Dispose deletes objects; losing the detached context also releases the browser's context slot.
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
});
defineExpose({ refresh, retry: start });
</script>

<template>
  <div ref="host" class="liquid-glass-scene" :data-glass-status="status" :style="backgroundStyle">
    <canvas ref="canvas" class="liquid-glass-scene__canvas" :class="{ 'is-ready': status === 'webgl' }" aria-hidden="true" />
    <div ref="content" class="liquid-glass-scene__content"><slot :status="status" /></div>
  </div>
</template>

<style scoped>
.liquid-glass-scene { position: relative; isolation: isolate; overflow: hidden; background-color: #eaf3ef; background-position: center; background-size: cover; }
.liquid-glass-scene__canvas { position: absolute; inset: 0; z-index: 0; display: block; width: 100%; height: 100%; pointer-events: none; visibility: hidden; }
.liquid-glass-scene__canvas.is-ready { visibility: visible; }
.liquid-glass-scene__content { position: relative; z-index: 1; }
</style>
