<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, onUpdated, ref, useId, watch } from 'vue';
import { finiteClamp, glassContextKey, type GlassVariant } from './context';

const props = withDefaults(defineProps<{
  radius?: number;
  blur?: number;
  refraction?: number;
  variant?: GlassVariant;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
}>(), { radius: 14, blur: 2, refraction: 24, variant: 'surface', disabled: false, loading: false, type: 'button' });
const emit = defineEmits<{ click: [event: MouseEvent] }>();
const scene = inject(glassContextKey, null);
const id = useId();
const button = ref<HTMLButtonElement>();
const inactive = computed(() => props.disabled || props.loading);
const mode = computed(() => scene?.status.value === 'webgl' && !inactive.value ? 'webgl' : 'fallback');
const style = computed(() => ({
  '--glass-radius': `${finiteClamp(props.radius, 14, 0, 9999)}px`,
  '--glass-blur': `${finiteClamp(props.blur, 2, 0, 24)}px`,
}));
let pointerId: number | undefined;

function release() {
  if (pointerId !== undefined && button.value?.hasPointerCapture(pointerId)) button.value.releasePointerCapture(pointerId);
  pointerId = undefined;
  scene?.press(id, false);
}
function pointerDown(event: PointerEvent) {
  if (inactive.value || event.button !== 0 || !event.isPrimary) return;
  pointerId = event.pointerId;
  button.value?.setPointerCapture(event.pointerId);
  scene?.press(id, true, event);
}
function keyDown(event: KeyboardEvent) {
  if (!inactive.value && !event.repeat && (event.key === ' ' || event.key === 'Enter')) scene?.press(id, true);
}
function keyUp(event: KeyboardEvent) {
  if (event.key === ' ' || event.key === 'Enter') release();
}
function click(event: MouseEvent) {
  if (inactive.value) { event.preventDefault(); return; }
  emit('click', event);
}
watch(inactive, (value) => { if (value) release(); });
onMounted(() => {
  if (button.value) scene?.register(id, {
    element: button.value,
    options: () => ({ radius: props.radius, blur: props.blur, refraction: props.refraction, variant: props.variant, disabled: inactive.value }),
  });
});
onUpdated(() => scene?.refresh());
onBeforeUnmount(() => { release(); scene?.unregister(id); });
defineExpose({ focus: () => button.value?.focus(), blur: () => button.value?.blur() });
</script>

<template>
  <button ref="button" class="liquid-glass-button" :class="`liquid-glass-button--${variant}`"
    :style="style" :data-glass-mode="mode" :type="type" :disabled="inactive" :aria-busy="loading || undefined"
    @click="click" @pointerdown="pointerDown" @pointerup="release" @pointercancel="release" @lostpointercapture="release"
    @pointermove="pointerId === $event.pointerId && scene?.drag(id, $event)"
    @keydown="keyDown" @keyup="keyUp" @blur="release">
    <span v-if="loading" class="liquid-glass-button__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.liquid-glass-button {
  box-sizing: border-box; position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 48px; padding: 11px 20px; border: 1px solid #ffffffb3; border-radius: var(--glass-radius);
  background: #f8fcfac7; color: #193b35; font: inherit; font-weight: 500; line-height: 1.5;
  box-shadow: inset 0 1px 1px #ffffffcc, 0 6px 20px #193b351a;
  backdrop-filter: blur(var(--glass-blur)) saturate(1.5); -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.5);
  cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; text-decoration: none;
}
.liquid-glass-button::before {
  content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; border-radius: inherit;
  background: linear-gradient(135deg, #ffffff38 0%, #ffffff12 42%, transparent 70%);
  box-shadow: inset 0 1px 1px #ffffffdb, inset 0 0 0 1px #ffffff61, 0 5px 16px #193b3514;
  opacity: 0; transition: opacity 180ms ease-out;
}
.liquid-glass-button--transparent { background: #ffffff26; }
.liquid-glass-button--primary { background: #175f54; color: #fff; }
.liquid-glass-button[data-glass-mode='webgl'] { background: transparent; border-color: transparent; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
.liquid-glass-button:focus-visible { outline: 3px solid #175f54; outline-offset: 4px; }
.liquid-glass-button--primary:focus-visible { outline-color: #fff; box-shadow: 0 0 0 6px #175f54; }
.liquid-glass-button:hover { text-decoration: none; }
@media (hover: hover) and (pointer: fine) {
  .liquid-glass-button:hover:not(:disabled)::before { opacity: 1; }
}
.liquid-glass-button:focus-visible:not(:disabled)::before { opacity: 1; }
.liquid-glass-button:active:not(:disabled) { filter: brightness(0.96); }
.liquid-glass-button:disabled { cursor: not-allowed; opacity: 0.55; }
.liquid-glass-button__spinner { width: 1em; height: 1em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: glass-spin 0.8s linear infinite; }
@keyframes glass-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .liquid-glass-button__spinner { animation: none; } .liquid-glass-button::before { transition: none; } }
@media (forced-colors: active) { .liquid-glass-button { background: ButtonFace !important; color: ButtonText; border-color: ButtonText !important; box-shadow: none; } .liquid-glass-button::before { display: none; } }
</style>
