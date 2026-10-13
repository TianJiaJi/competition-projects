<script setup lang="ts">
import AdminButton from "./AdminButton.vue";
withDefaults(
  defineProps<{
    loading?: boolean;
    retain?: boolean;
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
  <div v-if="retain && (loading || error)" class="flow-load-note" :role="error ? 'alert' : 'status'">
    <span>{{ error ? `刷新失败，当前仍为上次读取的数据。${error}` : loadingText }}</span>
    <AdminButton size="sm" v-if="error"  type="button" @click="$emit('retry')">重试</AdminButton>
  </div>
  <div v-if="retain" class="flow-retained" :inert="loading" :aria-busy="loading"><slot /></div>
  <div v-else-if="loading" class="async-state" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true" />
    <span>{{ loadingText }}</span>
  </div>
  <div v-else-if="error" class="async-state" role="alert">
    <strong>读取失败</strong>
    <span>{{ error }}</span>
    <AdminButton  type="button" @click="$emit('retry')">重试</AdminButton>
  </div>
  <div v-else-if="empty" class="async-state">
    <strong>没有数据</strong>
    <span>{{ emptyText }}</span>
    <slot name="empty-action" />
  </div>
  <slot v-else />
</template>
