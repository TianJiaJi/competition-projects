<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { attachScrollbar } from './controller';
import type { ScrollbarController, ScrollbarOptions } from './types';
import type { ScrollState } from './geometry';
const props = withDefaults(defineProps<Omit<ScrollbarOptions, 'onScroll'>>(), { direction: 'vertical', theme: 'auto', visibility: 'interaction', label: '可滚动内容' });
const emit = defineEmits<{ scroll: [state: ScrollState] }>();
const element = ref<HTMLElement>();
let controller: ScrollbarController | undefined;
function connect() { controller?.destroy(); if (element.value) controller = attachScrollbar(element.value, { ...props, onScroll: state => emit('scroll', state) }); }
onMounted(connect);
watch(() => [props.direction, props.theme, props.visibility, props.label], connect);
onBeforeUnmount(() => controller?.destroy());
defineExpose({ element, update: () => controller?.update(), scrollTo: (options: ScrollToOptions) => controller?.scrollTo(options), scrollBy: (options: ScrollToOptions) => controller?.scrollBy(options) });
</script>
<template><div ref="element" class="sg-scroll-area" :data-direction="direction" :data-theme="theme === 'auto' ? undefined : theme" :aria-label="label" role="region" tabindex="0"><slot /></div></template>
