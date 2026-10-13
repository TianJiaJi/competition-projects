<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { X } from "lucide-vue-next";
import { lockPageScroll } from './scroll-lock';
const props = defineProps<{ title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
const previous = document.activeElement as HTMLElement | null;
let unlockScroll: (()=>void) | undefined;
function keyboard(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
  if (event.key !== "Tab") return;
  const focusable = [
    ...(panel.value?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
    ) || []),
  ].filter((el) => el.getClientRects().length);
  const first = focusable[0],
    last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
onMounted(() => {
  unlockScroll=lockPageScroll();
  document.addEventListener("keydown", keyboard);
  void nextTick(() =>
    panel.value?.querySelector<HTMLElement>("button")?.focus(),
  );
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", keyboard);
  unlockScroll?.();
  if(previous?.isConnected)previous.focus({preventScroll:true});
});
</script>
<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <section
      ref="panel"
      class="detail-dialog"
      :class="{ 'wide-dialog': props.wide }"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <div class="modal-title">
        <h2>{{ title }}</h2>
        <button
          class="icon-button"
          :aria-label="`关闭${title}`"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </div>
      <slot />
    </section>
  </div>
</template>
