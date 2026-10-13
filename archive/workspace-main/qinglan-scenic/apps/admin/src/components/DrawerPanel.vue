<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from "vue";
import { LiquidGlassSurface } from "@scenic/ui/liquid-glass";
import { flowKey } from "../app/flow";
const flow = inject(flowKey, null);
import AdminButton from "./AdminButton.vue";

const props = withDefaults(defineProps<{ title: string; wide?: boolean; subtitle?: string }>(), {});
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | InstanceType<typeof LiquidGlassSurface>>();
function panelElement(): HTMLElement | undefined {
  const value = panel.value;
  return value instanceof HTMLElement ? value : value?.$el;
}
let previousFocus: HTMLElement | null = null;

function focusables(): HTMLElement[] {
  if (!panelElement()) return [];
  return Array.from(
    panelElement()!.querySelectorAll<HTMLElement>(
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
  (items[0] ?? panelElement())?.focus();
});

onBeforeUnmount(() => {
  previousFocus?.focus();
});
</script>

<template>
  <Teleport to="body" :disabled="!flow">
  <div class="overlay" :class="flow ? 'flow-overlay' : undefined" @mousedown.self="emit('close')">
    <component :is="flow ? LiquidGlassSurface : 'aside'" :as="flow ? 'aside' : undefined" :radius="flow ? 22 : undefined" :blur="flow ? 8 : undefined" :tint-opacity="flow ? 0.94 : undefined"
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
    </component>
  </div>
  </Teleport>
</template>
