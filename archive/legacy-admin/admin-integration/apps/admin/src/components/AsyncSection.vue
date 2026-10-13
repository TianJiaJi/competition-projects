<script setup lang="ts">
withDefaults(
  defineProps<{
    loading?: boolean;
    error?: string;
    empty?: boolean;
    emptyText?: string;
    loadingText?: string;
  }>(),
  { emptyText: "没有符合条件的数据。", loadingText: "正在读取…" },
);
defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="loading" class="async-state" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true" />
    <span>{{ loadingText }}</span>
  </div>
  <div v-else-if="error" class="async-state" role="alert">
    <strong>读取失败</strong>
    <span>{{ error }}</span>
    <button class="btn" type="button" @click="$emit('retry')">重试</button>
  </div>
  <div v-else-if="empty" class="async-state">
    <strong>没有数据</strong>
    <span>{{ emptyText }}</span>
    <slot name="empty-action" />
  </div>
  <slot v-else />
</template>
