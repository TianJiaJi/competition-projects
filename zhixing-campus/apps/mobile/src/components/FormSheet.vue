<script setup lang="ts">
import { onMounted, onBeforeUnmount, nextTick } from "vue";
const props = withDefaults(defineProps<{ title: string; description?: string; closeLabel?: string; locked?: boolean }>(), { closeLabel: '关闭选择', locked: false });
const emit = defineEmits<{ close: [] }>();
function close() { if (!props.locked) emit('close'); }
// #ifdef H5
let previous: HTMLElement | null = null;
let oldOverflow = "";
let host: HTMLElement | null = null;
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") { event.preventDefault(); close(); }
  if (event.key !== "Tab" || !host) return;
  const focusable = Array.from(host.querySelectorAll<HTMLElement>('button,uni-button,input,[tabindex="0"]')).filter(element => !element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true');
  if (!focusable.length) { event.preventDefault(); return; }
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
  <view class="campus-sheet-mask" @click.self="close">
    <view class="campus-sheet" role="dialog" aria-modal="true" :aria-label="title">
      <view class="sheet-heading"><view><text class="sheet-title">{{ title }}</text><text v-if="description" class="sheet-description">{{ description }}</text></view><button role="button" class="sheet-close" :aria-label="closeLabel" :disabled="locked" :aria-disabled="locked" @click="close">×</button></view>
      <view class="sheet-body"><slot /></view>
      <view v-if="$slots.footer" class="sheet-footer"><slot name="footer" /></view>
    </view>
  </view>
</template>
