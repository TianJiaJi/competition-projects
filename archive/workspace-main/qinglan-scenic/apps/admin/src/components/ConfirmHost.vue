<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { resolveConfirm } from "../app/state";
import type { ConfirmRequest } from "../app/state";
import { LiquidGlassSurface } from "@scenic/ui/liquid-glass";
import AdminButton from "./AdminButton.vue";

const props = defineProps<{ request: ConfirmRequest | null }>();
const confirmButton = ref<InstanceType<typeof AdminButton> | null>(null);
let previousFocus: HTMLElement | null = null;

function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.stopPropagation(); resolveConfirm(false); return; }
  if (event.key !== 'Tab') return;
  const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  const first = buttons[0], last = buttons.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

watch(
  () => props.request,
  async (value) => {
    if (!value) { previousFocus?.focus({ preventScroll: true }); return; }
    previousFocus = document.activeElement as HTMLElement | null;
    await nextTick();
    const button = (confirmButton.value?.$el ?? null) as HTMLElement | null;
    button?.focus();
  },
);
</script>

<template>
  <Teleport to="body">
  <div v-if="request" class="modal-overlay flow-confirm-overlay" @mousedown.self="resolveConfirm(false)">
    <LiquidGlassSurface :radius="22" :blur="8" :tint-opacity="0.94" class="modal flow-modal" role="alertdialog" aria-modal="true" :aria-label="request.title" @keydown="keyboard">
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
    </LiquidGlassSurface>
  </div>
  </Teleport>
</template>
