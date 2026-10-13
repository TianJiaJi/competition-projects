<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, ref } from 'vue';
import { createUniScrollAdapter, type ScrollState, type ScrollDirection, type ScrollTheme, type ScrollVisibility } from '../../../../packages/ui/src/scrollbar/uni';
withDefaults(defineProps<{ direction?: ScrollDirection; theme?: ScrollTheme; visibility?: ScrollVisibility; label?: string }>(), { direction: 'vertical', theme: 'auto', visibility: 'interaction', label: '可滚动内容' });
const emit = defineEmits<{ scroll: [state: ScrollState] }>();
const instance = getCurrentInstance(), top = ref(0), left = ref(0);
const adapter = createUniScrollAdapter({
  nextTick,
  writePosition: position => { if (position.top !== undefined) top.value = position.top; if (position.left !== undefined) left.value = position.left; },
  onScroll: state => emit('scroll', state),
  measure: () => new Promise(resolve => {
    const query = uni.createSelectorQuery().in(instance?.proxy);
    query.select('.sg-uni-scroll-area').boundingClientRect();
    query.select('.sg-uni-scroll-content').boundingClientRect();
    query.exec(results => resolve({ width: results[0]?.width || 0, height: results[0]?.height || 0, contentWidth: results[1]?.width || 0, contentHeight: results[1]?.height || 0 }));
  }),
});
onMounted(() => nextTick(adapter.update));
defineExpose({ scrollTo: adapter.scrollTo, scrollBy: adapter.scrollBy, update: adapter.update });
</script>
<template><scroll-view class="sg-uni-scroll-area" :scroll-y="direction !== 'horizontal'" :scroll-x="direction !== 'vertical'" :scroll-top="top" :scroll-left="left" :aria-label="label" :data-theme="theme" @scroll="adapter.onNativeScroll($event.detail)"><view class="sg-uni-scroll-content" :class="{ 'sg-uni-horizontal': direction === 'horizontal' }"><slot /></view></scroll-view></template>
<style scoped>.sg-uni-scroll-area { display: block; min-width: 0; min-height: 0; width: 100%; height: 100%; }.sg-uni-scroll-content { min-height: 100%; }.sg-uni-horizontal { width: max-content; }</style>
