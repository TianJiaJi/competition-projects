<script setup lang="ts">
import { computed } from 'vue';
import { Activity } from 'lucide-vue-next';
import type { TimelineEntry } from './task-store';
const props = defineProps<{ entries: TimelineEntry[] }>();
const recent = computed(() => [...props.entries].reverse().slice(0, 12));
</script>
<template><section class="panel timeline-panel"><div class="panel-heading"><h3><Activity :size="17"/>协作时间线</h3><span>{{ entries.length }} 条记录</span></div><div v-if="!recent.length" class="timeline-empty">接收项目后，这里会留下每一步交付与测试记录。</div><ol class="task-timeline"><li v-for="entry in recent" :key="entry.id"><span class="timeline-dot"/><time>{{ new Date(entry.at).toLocaleTimeString('zh-CN', {hour12:false}) }}</time><b>{{ entry.title }}</b><p>{{ entry.detail }}</p><small>{{ entry.actor }}</small></li></ol></section></template>
