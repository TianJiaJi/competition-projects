<script setup lang="ts">
import { useId } from 'vue';
import { scenicArtSvg } from './svg';
withDefaults(defineProps<{ size?: number | string; label?: string; decorative?: boolean }>(), {
  size: 40, label: '青岚山境', decorative: false,
});
const svg = scenicArtSvg('logo', `scenic-logo-${useId()}`);
</script>
<template>
  <span class="scenic-logo" :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : label" :aria-hidden="decorative ? true : undefined"
    :style="{ width: typeof size === 'number' ? `${size}px` : size, height: typeof size === 'number' ? `${size}px` : size }"
    v-html="svg" />
</template>
<style scoped>
.scenic-logo { display: inline-block; flex-shrink: 0; vertical-align: middle; line-height: 0; }
.scenic-logo :deep(svg) { display: block; }
</style>
