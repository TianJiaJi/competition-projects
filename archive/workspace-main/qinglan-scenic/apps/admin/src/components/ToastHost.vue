<script setup lang="ts">
import AdminButton from "./AdminButton.vue";
import { dismissToast, toasts } from "../app/state";
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <div v-for="toast in toasts" :key="toast.id" class="toast" :class="`toast--${toast.kind}`" role="status">
      <span aria-hidden="true">{{ toast.kind === "success" ? "✓" : toast.kind === "error" ? "!" : "i" }}</span>
      <span style="flex: 1">{{ toast.text }}</span>
      <AdminButton variant="ghost" size="sm"  type="button" @click="dismissToast(toast.id)">关闭</AdminButton>
    </div>
  </div>
</template>
