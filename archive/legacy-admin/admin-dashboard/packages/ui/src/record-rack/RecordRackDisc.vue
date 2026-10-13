<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type CSSProperties } from 'vue';
import { clamp, RackWheelMotion, wheelPixels } from './motion';
import type { RecordRackLeaf, RackPlacement, RackMotion, RackSource } from './types';
const props = defineProps<{ items: RecordRackLeaf[]; position: number; activeId?: string; ancestorId?: string; size: number; extract: number; placement: RackPlacement; motion: Required<RackMotion>; reduced: boolean; label: string; level: 2 | 3; }>();
const emit = defineEmits<{ 'update:position': [index: number]; activate: [index: number, source: RackSource]; interact: [source: 'wheel' | 'keyboard']; }>();
const root = ref<HTMLElement>();
const diameter = computed(() => props.size * .94);
const discStyle = computed<CSSProperties>(() => {
  const inset = (props.size - diameter.value) / 2;
  const [dx, dy] = direction.value;
  return { width: `${diameter.value}px`, height: `${diameter.value}px`,
    left: `${inset + dx * props.size * props.extract}px`, top: `${inset + dy * props.size * props.extract}px`,
    '--rr-marker': `${Math.max(.025, props.size * (.5 - props.extract + .015) / diameter.value) * 100}%` };
});
const direction = computed(() => ({ left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] }[props.placement]));
const previewIndex = computed(() => clamp(Math.round(props.position), 0, Math.max(0, props.items.length - 1)));
let wheel = new RackWheelMotion(props.position), frame = 0, previousFrame = 0;
function cancel(snap = false) {
  cancelAnimationFrame(frame); frame = 0; wheel.pending = false;
  if (snap) {
    wheel.position = clamp(Math.round(wheel.position), 0, Math.max(0, props.items.length - 1));
    if (props.position !== wheel.position) emit('update:position', wheel.position);
  }
  wheel.target = wheel.position;
}
function reset(index: number) { cancel(); wheel = new RackWheelMotion(index); emit('update:position', index); }
function focus() { nextTick(() => root.value?.querySelector<HTMLButtonElement>('.rr-track[tabindex="0"]')?.focus()); }
function select(index: number, source: RackSource) { reset(index); emit('activate', index, source); }
function animate(now: number) {
  const settled = wheel.advance(now, (now - previousFrame) / 1000, props.items.length, props.motion.damping, props.motion.settleDelay, props.motion.snapEpsilon, props.reduced);
  previousFrame = now; emit('update:position', wheel.position);
  if (settled !== null) { frame = 0; emit('activate', settled, 'wheel'); return; }
  if (wheel.pending) frame = requestAnimationFrame(animate);
}
function spin(event: WheelEvent) {
  if (event.ctrlKey || event.metaKey) return;
  event.stopPropagation();
  if (!props.items.length) return;
  event.preventDefault(); emit('interact', 'wheel');
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
  if (!delta) return;
  wheel.input(wheelPixels(delta, event.deltaMode, props.size) * (props.placement === 'left' ? 1 : -1), props.items.length, performance.now(), props.motion.wheelStep);
  if (!frame) { previousFrame = performance.now(); frame = requestAnimationFrame(animate); }
}
function keydown(event: KeyboardEvent) {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); emit('interact', 'keyboard');
  reset(event.key === 'Home' ? 0 : event.key === 'End' ? Math.max(0, props.items.length - 1) : clamp(previewIndex.value + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1), 0, Math.max(0, props.items.length - 1)));
  focus();
}
watch(() => props.position, index => { if (index !== wheel.position) reset(index); });
watch(() => props.items, () => reset(clamp(Math.round(props.position), 0, Math.max(0, props.items.length - 1))));
onBeforeUnmount(() => cancel());
defineExpose({ cancel, reset, focus });
function trackStyle(index: number): CSSProperties {
  const diff = index - props.position;
  const [dx, dy] = direction.value;
  const angle = Math.atan2(dy, dx) + diff * 50 * Math.PI / 180;
  const radius = diameter.value * 0.335;
  // Keep the text inside the exposed crescent, including shallow extraction presets.
  const exposedSpace = props.size * (props.extract - .5) + Math.cos(diff * 50 * Math.PI / 180) * radius - 6;
  const relativeAngle = diff * 50 * Math.PI / 180;
  const radialRoom = exposedSpace - 15 * Math.abs(Math.sin(relativeAngle));
  const maxWidth = radialRoom * 2 / Math.max(.01, Math.abs(Math.cos(relativeAngle)));
  const width = Math.min(diameter.value * .4, Math.max(40, maxWidth));
  const hidden = Math.abs(diff) > 1.65 || maxWidth < 40;
  // Fix the reading direction per docking side; keep the text parallel to its own diameter throughout rotation.
  const textAngle = angle * 180 / Math.PI - (dx < 0 || dy > 0 ? 180 : 0);
  return { transform: `translate(-50%, -50%) rotate(${textAngle}deg)`, width: `${width}px`, left: `${diameter.value / 2 - 1 + Math.cos(angle) * radius}px`, top: `${diameter.value / 2 - 1 + Math.sin(angle) * radius}px`, opacity: Math.max(0, 1 - Math.max(0, Math.abs(diff) - 0.65) * 0.65), visibility: hidden ? 'hidden' : 'visible' };
}
</script>
<template>
  <div ref="root" class="rr-disc" :style="discStyle" :class="`rr-${placement}`" :data-level="level" :aria-label="label" @wheel="spin" @keydown="keydown">
    <div class="rr-grooves" :style="{ transform: `rotate(${reduced ? 0 : position * -50}deg)` }" aria-hidden="true" />
    <span class="rr-hole" aria-hidden="true" />
    <span class="rr-indicator" aria-hidden="true"><slot name="indicator" :item="items[previewIndex]"><span>▸</span></slot></span>
    <button v-for="(item, index) in items" :key="item.id" type="button" class="rr-track" :class="{ 'rr-preview': previewIndex === index, 'rr-active': activeId === item.id || ancestorId === item.id }" :style="trackStyle(index)" :tabindex="previewIndex === index ? 0 : -1" :aria-current="activeId === item.id ? 'page' : undefined" :title="item.label" @click="select(index, $event.detail === 0 ? 'keyboard' : 'pointer')">
      <slot name="item" :item="item" :preview="previewIndex === index" :active="activeId === item.id || ancestorId === item.id"><component :is="item.icon" v-if="item.icon" class="rr-icon" /><span>{{ item.label }}</span></slot>
    </button>
    <span v-if="!items.length" class="rr-empty">暂无可用菜单</span>
  </div>
</template>
<style scoped>
.rr-disc { border: 1px solid var(--rack-border); background: linear-gradient(135deg, rgb(255 255 255 / .42), transparent 60%), rgb(var(--rack-tint) / var(--rack-opacity)); backdrop-filter: blur(var(--rack-blur)); -webkit-backdrop-filter: blur(var(--rack-blur)); box-shadow: var(--rack-shadow), inset 0 1px 0 rgb(255 255 255 / .9); }
.rr-grooves { position: absolute; inset: 7px; border-radius: 50%; background: repeating-radial-gradient(circle, transparent 0 9px, rgb(255 255 255 / .3) 10px, transparent 11px), conic-gradient(from 20deg, transparent, rgb(255 255 255 / .4), transparent 25%, rgb(183 220 213 / .3) 55%, transparent 80%); pointer-events: none; }
.rr-hole { position: absolute; width: 18%; height: 18%; left: 41%; top: 41%; border: 1px solid var(--rack-border); border-radius: 50%; background: rgb(255 255 255 / .25); pointer-events: none; }
.rr-track { position: absolute; transform: translate(-50%, -50%); width: calc(var(--rack-size) * .4); min-height: 30px; padding: 5px 7px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--rack-muted); font-family: inherit; font-size: var(--rack-track-size); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; }
.rr-indicator { position: absolute; left: calc(50% + var(--rr-dx) * var(--rr-marker)); top: calc(50% + var(--rr-dy) * var(--rr-marker)); transform: translate(-50%, -50%); color: var(--rack-accent); z-index: 2; pointer-events: none; }
.rr-empty { position: absolute; left: calc(50% + var(--rr-dx) * 30%); top: calc(50% + var(--rr-dy) * 30%); transform: translate(-50%, -50%); width: 80px; text-align: center; font-size: var(--rack-support-size, 11px); }
.rr-icon { width: 15px; height: 15px; flex-shrink: 0; }
.rr-track span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.rr-track.rr-preview { color: var(--rack-text); background: var(--rack-highlight); border-color: var(--rack-border); box-shadow: 0 3px 12px rgb(30 60 55 / .08); }
.rr-track.rr-active { color: var(--rack-active); font-weight: 700; }
.rr-active::after { content: ''; position: absolute; bottom: 1px; width: 12px; height: 2px; background: var(--rack-active); border-radius: 2px; }
.rr-disc { border: 1px solid var(--rack-border); background-image: linear-gradient(135deg, rgb(255 255 255 / .42), transparent 60%); box-shadow: var(--rack-shadow), inset 0 1px 0 rgb(255 255 255 / .9); }
.rr-disc * { box-sizing: border-box; }
.rr-right .rr-indicator { transform: translate(-50%, -50%) rotate(180deg); }
.rr-top .rr-indicator { transform: translate(-50%, -50%) rotate(90deg); }
.rr-bottom .rr-indicator { transform: translate(-50%, -50%) rotate(-90deg); }
button:focus-visible { outline: 2px solid var(--rack-accent); outline-offset: 3px; }
@keyframes rr-extract { from { translate: calc(-1 * var(--rr-dx) * var(--rr-extract)) calc(-1 * var(--rr-dy) * var(--rr-extract)); opacity: .2; } to { translate: 0 0; opacity: 1; } }
@supports not (backdrop-filter: blur(1px)) { .rr-disc { background: rgb(var(--rack-tint) / .93); } }
@media (prefers-reduced-motion: reduce) { .rr-disc, .rr-disc * { animation: none !important; transition: none !important; } }
@media (forced-colors: active) { .rr-disc, .rr-track.rr-preview { background: Canvas; color: CanvasText; border-color: CanvasText; } }
</style>
