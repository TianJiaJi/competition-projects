<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import './material.css';
import { finiteClamp, glassContextKey, type GlassVariant } from './context';

const props = withDefaults(defineProps<{
  radius?: number;
  blur?: number;
  /** Base surface opacity: 0 is clear, 1 is opaque. */
  tintOpacity?: number;
  /** @deprecated CSS glass has no optical displacement. Accepted for migration only. */
  refraction?: number;
  variant?: GlassVariant;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
}>(), { radius: 14, blur: 2, variant: 'surface', disabled: false, loading: false, type: 'button' });
const emit = defineEmits<{ click: [event: MouseEvent] }>();
const scene = inject(glassContextKey, null);
const button = ref<HTMLButtonElement>();
const inactive = computed(() => props.disabled || props.loading);
const blur = computed(() => scene?.status.value === 'plain' || inactive.value ? 0 : finiteClamp(props.blur, 2, 0, 8));
const style = computed(() => ({
  '--glass-radius': `${finiteClamp(props.radius, 14, 0, 9999)}px`,
  '--glass-blur': `${blur.value}px`,
  '--glass-tint-opacity': finiteClamp(props.tintOpacity ?? (props.variant === 'transparent' ? 0.08 : 0.18), 0.18, 0, 1),
}));
function click(event: MouseEvent) {
  if (inactive.value) { event.preventDefault(); return; }
  emit('click', event);
}
defineExpose({ focus: () => button.value?.focus(), blur: () => button.value?.blur() });
</script>

<template>
  <button ref="button" class="liquid-glass-button liquid-glass-material" :class="`liquid-glass-button--${variant}`"
    :style="style" :data-glass-mode="blur > 0 ? 'css' : 'plain'" :type="type" :disabled="inactive" :aria-busy="loading || undefined"
    @click="click">
    <span v-if="loading" class="liquid-glass-button__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.liquid-glass-button { position:relative; display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:48px; padding:11px 20px; cursor:pointer; touch-action:manipulation; -webkit-tap-highlight-color:transparent; text-decoration:none; }
.liquid-glass-button::before {
  content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none; border-radius: inherit;
  background: linear-gradient(135deg, rgb(255 255 255 / 0.24), rgb(255 255 255 / 0.05) 50%, transparent 75%);
  opacity: 0; transition: opacity 180ms ease-out;
}
.liquid-glass-button--primary { background-color: rgb(23 95 84 / calc(0.7 + var(--glass-tint-opacity) * 0.2)); color: var(--glass-text-color, #fff); }
.liquid-glass-button:focus-visible { outline: 3px solid #175f54; outline-offset: 4px; }
.liquid-glass-button--primary:focus-visible { outline-color: #fff; box-shadow: 0 0 0 6px #175f54; }
.liquid-glass-button:hover { text-decoration: none; }
@media (hover: hover) and (pointer: fine) {
  .liquid-glass-button:hover:not(:disabled)::before { opacity: 1; }
}
.liquid-glass-button:focus-visible:not(:disabled)::before,
.liquid-glass-button:active:not(:disabled)::before { opacity: 1; }
.liquid-glass-button:disabled { cursor: not-allowed; opacity: 0.55; }
.liquid-glass-button__spinner { width: 1em; height: 1em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: glass-spin 0.8s linear infinite; }
@keyframes glass-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .liquid-glass-button__spinner { animation: none; }
  .liquid-glass-button::before { transition: none; }
}
@media (forced-colors: active) {
  .liquid-glass-button { background: ButtonFace !important; color: ButtonText; border-color: ButtonText !important; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
  .liquid-glass-button::before { display: none; }
}
</style>
