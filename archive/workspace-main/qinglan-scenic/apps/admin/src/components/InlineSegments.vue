<script setup lang="ts">
import { isCatalogueImage, type InlineSegment } from "../core/markdown";

defineProps<{ segments: InlineSegment[] }>();
</script>

<template>
  <template v-for="(segment, index) in segments" :key="index">
    <strong v-if="segment.kind === 'strong'">{{ segment.text }}</strong>
    <code v-else-if="segment.kind === 'code'">{{ segment.text }}</code>
    <a v-else-if="segment.kind === 'link' && segment.safe" :href="segment.url" rel="noopener noreferrer">{{ segment.text }}</a>
    <span v-else-if="segment.kind === 'link'" class="muted">
      {{ segment.text }}<span class="tag tag--warning" style="margin-left: 6px">链接已禁用</span>
    </span>
    <img
      v-else-if="segment.kind === 'image' && segment.safe && isCatalogueImage(segment.url ?? '')"
      class="thumb"
      :src="segment.url"
      :alt="segment.text || '正文图片'"
    />
    <span v-else-if="segment.kind === 'image'" class="muted small">
      {{ segment.text || segment.url }}<span class="tag tag--warning" style="margin-left: 6px">图片已忽略</span>
    </span>
    <span v-else>{{ segment.text }}</span>
  </template>
</template>
