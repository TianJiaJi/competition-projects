<script setup lang="ts">
import { computed, useId } from 'vue';
import { scenicArtForPoint } from './catalogue';
import { scenicArtSvg } from './svg';
const props = withDefaults(defineProps<{
  pointId?: string; width?: number | string; height?: number | string;
  fit?: 'contain' | 'cover'; label?: string; decorative?: boolean;
}>(), { pointId: 'landscape', width: '100%', fit: 'contain', decorative: false });
const uid = useId();
const markup = computed(() => scenicArtSvg(props.pointId, `scenic-art-${uid}`, props.fit));
const size = (v: string | number | undefined) => typeof v === 'number' ? `${v}px` : v;
</script>
<template>
  <span class="scenic-illustration" :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : label ?? scenicArtForPoint(pointId).alt"
    :aria-hidden="decorative ? true : undefined"
    :style="{ width: size(width), height: size(height), aspectRatio: height == null ? '3 / 2' : undefined }"
    v-html="markup" />
</template>
<style scoped>
.scenic-illustration { display: block; overflow: hidden; flex-shrink: 0; }
.scenic-illustration :deep(svg) { display: block; }
</style>
