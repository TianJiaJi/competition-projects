<script setup lang="ts">
import { computed, provide, ref, watch } from 'vue';
import { glassContextKey, type GlassStatus } from './context';

const props = withDefaults(defineProps<{
  background?: string;
  /** Turn off backdrop filtering for descendant buttons. */
  disabled?: boolean;
  /** @deprecated CSS rendering does not use a canvas pixel ratio. Accepted for migration only. */
  maxDpr?: number;
}>(), { background: '', disabled: false });
const emit = defineEmits<{ status: [value: GlassStatus]; error: [error: Error] }>();
const status = computed<GlassStatus>(() => props.disabled ? 'plain' : 'css');
const imageRevision = ref(0);
provide(glassContextKey, { status });
watch(status, (value) => emit('status', value), { immediate: true });
// Kept for source compatibility; layout now follows normal DOM/CSS automatically.
function refresh() {}
function retry() { imageRevision.value++; }
defineExpose({ refresh, retry });
</script>

<template>
  <div class="liquid-glass-scene" :data-glass-status="status">
    <img v-if="background" :key="`${background}-${imageRevision}`" :src="background"
      class="liquid-glass-scene__background" alt="" aria-hidden="true" draggable="false"
      @error="emit('error', new Error('玻璃背景加载失败，请检查图片路径'))" />
    <div class="liquid-glass-scene__content"><slot :status="status" /></div>
  </div>
</template>

<style scoped>
.liquid-glass-scene { position: relative; overflow: hidden; background-color: #eaf3ef; }
.liquid-glass-scene__background { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
.liquid-glass-scene__content { position: relative; }
</style>
