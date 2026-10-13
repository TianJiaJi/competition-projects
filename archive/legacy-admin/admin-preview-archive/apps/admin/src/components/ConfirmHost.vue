<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { resolveConfirm } from "../app/state";
import type { ConfirmRequest } from "../app/state";
import AdminButton from "./AdminButton.vue";

const props = defineProps<{ request: ConfirmRequest | null }>();
const confirmButton = ref<InstanceType<typeof AdminButton> | null>(null);

watch(
  () => props.request,
  async (value) => {
    if (!value) return;
    await nextTick();
    const button = (confirmButton.value?.$el ?? null) as HTMLElement | null;    button?.focus();
  },
);
</script>

<template>
  <div v-if="request" class="modal-overlay" @mousedown.self="resolveConfirm(false)">
    <div class="modal" role="alertdialog" aria-modal="true" :aria-label="request.title" @keydown.esc="resolveConfirm(false)">
      <header class="modal__header">
        <h2>{{ request.title }}</h2>
      </header>
      <div class="modal__body">
        <p style="margin: 0">{{ request.message }}</p>
        <ul v-if="request.details?.length" class="impact-list">
          <li v-for="detail in request.details" :key="detail">{{ detail }}</li>
        </ul>
      </div>
      <footer class="modal__footer">
        <AdminButton size="sm" @click="resolveConfirm(false)">取消</AdminButton>
        <AdminButton
          ref="confirmButton"
          size="sm"
          :variant="request.danger ? 'danger' : 'primary'"
          @click="resolveConfirm(true)"
        >
          {{ request.confirmText }}
        </AdminButton>
      </footer>
    </div>
  </div>
</template>
