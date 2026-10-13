<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import AdminButton from "./AdminButton.vue";

const props = withDefaults(defineProps<{ title: string; wide?: boolean; subtitle?: string }>(), {});
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement>();
let previousFocus: HTMLElement | null = null;

function focusables(): HTMLElement[] {
  if (!panel.value) return [];
  return Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.stopPropagation();
    emit("close");
    return;
  }
  if (event.key !== "Tab") return;
  const items = focusables();
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null;
  const items = focusables();
  (items[0] ?? panel.value)?.focus();
});

onBeforeUnmount(() => {
  previousFocus?.focus();
});
</script>

<template>
  <div class="overlay" @mousedown.self="emit('close')">
    <aside
      ref="panel"
      class="drawer"
      :class="wide ? 'drawer--wide' : undefined"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <header class="drawer__header">
        <div>
          <h2>{{ title }}</h2>
          <p v-if="subtitle" class="muted small" style="margin: 2px 0 0">{{ subtitle }}</p>
        </div>
        <AdminButton size="sm" @click="emit('close')">关闭</AdminButton>
      </header>
      <div class="drawer__body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="drawer__footer">
        <slot name="footer" />
      </footer>
    </aside>
  </div>
</template>
