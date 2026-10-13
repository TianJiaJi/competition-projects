<script setup lang="ts">
import { onMounted, onBeforeUnmount, nextTick } from "vue";
defineProps<{ title: string; description?: string }>();
const emit = defineEmits<{ close: [] }>();
// #ifdef H5
let previous: HTMLElement | null = null;
let oldOverflow = "";
let host: HTMLElement | null = null;
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); emit("close"); }
  if (event.key !== "Tab" || !host) return;
  const focusable = Array.from(host.querySelectorAll<HTMLElement>('button:not(:disabled),uni-button:not([disabled]),input,[tabindex="0"]'));
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
onMounted(async () => {
  previous = document.activeElement as HTMLElement;
  oldOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  await nextTick();
  host = document.querySelector<HTMLElement>(".campus-sheet");
  host?.querySelector<HTMLElement>('uni-button,button')?.focus();
  document.addEventListener("keydown", keydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", keydown);
  document.body.style.overflow = oldOverflow;
  previous?.focus();
});
// #endif
</script>
<template>
  <view class="campus-sheet-mask" @click.self="emit('close')">
    <view class="campus-sheet" role="dialog" aria-modal="true" :aria-label="title">
      <view class="sheet-heading"><view><text class="sheet-title">{{ title }}</text><text v-if="description" class="sheet-description">{{ description }}</text></view><button role="button" class="sheet-close" aria-label="关闭选择" @click="emit('close')">×</button></view>
      <view class="sheet-body"><slot /></view>
      <view v-if="$slots.footer" class="sheet-footer"><slot name="footer" /></view>
    </view>
  </view>
</template>
