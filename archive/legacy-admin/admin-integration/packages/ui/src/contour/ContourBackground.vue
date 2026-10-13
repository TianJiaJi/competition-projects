<script setup lang="ts">
import { computed, useId } from 'vue';
import type { ContourBackgroundProps } from './types';
import { terrainHeight, terrainPaths, terrainWidth } from './terrain';

const props = withDefaults(defineProps<ContourBackgroundProps>(), {
  theme: 'light', variant: 'corners',
});
const patternId = `contour-${useId()}`;
// Retain existing variants as three positions within the same continuous terrain.
const offset = computed(() => ({ corners: [0, 0], left: [-420, -180], right: [-940, -420] })[props.variant]);
const palette = computed(() => {
  const dark = props.theme === 'dark';
  const opacity = props.lineOpacity;
  return {
    '--contour-background': props.backgroundColor ?? (dark ? '#202321' : '#f5f4ef'),
    '--contour-line': props.lineColor ?? (dark ? '#ffffff' : '#000000'),
    '--contour-opacity': opacity !== undefined && Number.isFinite(opacity)
      ? Math.min(1, Math.max(0, opacity)) : (dark ? 0.06 : 0.05),
  };
});
</script>

<template>
  <div class="contour-background" :data-theme="theme" :data-variant="variant" :style="palette">
    <div class="contour-background__decoration" aria-hidden="true">
      <svg class="contour-background__terrain" width="100%" height="100%" fill="none" focusable="false">
        <defs>
          <pattern :id="patternId" patternUnits="userSpaceOnUse" :width="terrainWidth" :height="terrainHeight" :x="offset[0]" :y="offset[1]">
            <path v-for="(path, index) in terrainPaths" :key="index" :d="path" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" :fill="`url(#${patternId})`" />
      </svg>
    </div>
    <div class="contour-background__content"><slot /></div>
  </div>
</template>

<style scoped>
.contour-background {
  position: relative;
  isolation: isolate;
  min-width: 0;
  background: var(--contour-background);
}
.contour-background__decoration {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  user-select: none;
  color: var(--contour-line);
  opacity: var(--contour-opacity);
}
.contour-background__terrain { position: absolute; inset: 0; display: block; }
.contour-background__content { position: relative; z-index: 1; }
@media (forced-colors: active) {
  .contour-background__decoration { display: none; }
}
</style>
