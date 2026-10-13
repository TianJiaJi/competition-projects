<script setup lang="ts">
import { computed } from "vue";
import { isCatalogueImage, parseMarkdown } from "../core/markdown";
import InlineSegments from "./InlineSegments.vue";

const props = defineProps<{ source: string; emptyText?: string }>();

const blocks = computed(() => parseMarkdown(props.source ?? ""));
const isEmpty = computed(() => !(props.source ?? "").trim());
</script>

<template>
  <div class="markdown-preview">
    <p v-if="isEmpty" class="muted">{{ emptyText ?? "暂无正文内容。" }}</p>
    <template v-else>
      <template v-for="(block, index) in blocks" :key="index">
        <h2 v-if="block.kind === 'heading' && block.level === 2"><InlineSegments :segments="block.segments" /></h2>
        <h3 v-else-if="block.kind === 'heading'"><InlineSegments :segments="block.segments" /></h3>
        <p v-else-if="block.kind === 'paragraph'"><InlineSegments :segments="block.segments" /></p>
        <blockquote v-else-if="block.kind === 'quote'"><InlineSegments :segments="block.segments" /></blockquote>
        <ul v-else-if="block.kind === 'list'">
          <li v-for="(item, itemIndex) in block.items" :key="itemIndex"><InlineSegments :segments="item" /></li>
        </ul>
        <p v-else-if="block.kind === 'raw'" class="muted small">
          <span class="tag tag--warning">已忽略原始 HTML</span> {{ block.text }}
        </p>
        <figure v-else-if="block.kind === 'image' && block.safe && isCatalogueImage(block.url)" style="margin: 0 0 10px">
          <img :src="block.url" :alt="block.alt || '正文图片'" />
          <figcaption class="muted small">{{ block.alt || block.url }}（示意图）</figcaption>
        </figure>
        <p v-else-if="block.kind === 'image'" class="muted small">
          <span class="tag tag--warning">图片已忽略</span> {{ block.url }}
        </p>
      </template>
    </template>
  </div>
</template>
