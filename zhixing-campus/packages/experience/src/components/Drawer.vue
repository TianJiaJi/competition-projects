<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { LiquidGlassSurface, LiquidGlassButton } from "@scene/ui/liquid-glass";
import { X, ChevronLeft } from "lucide-vue-next";
defineProps<{ title: string; subtitle?: string; mobilePage?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement>();
let previous: HTMLElement | null = null;
function keydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("close");
  }
  if (e.key === "Tab") {
    const list = Array.from(
      panel.value?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input,textarea,select,[href]",
      ) ?? [],
    );
    if (!list.length) return;
    const first = list[0],
      last = list.at(-1)!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
onMounted(() => {
  previous = document.activeElement as HTMLElement;
  panel.value?.querySelector<HTMLElement>("button")?.focus();
});
onBeforeUnmount(() => previous?.focus());
</script>
<template>
  <Teleport to="body"
    ><div
      :class="['overlay', { 'staff-detail': mobilePage }]"
      @click.self="emit('close')"
    >
      <aside
        ref="panel"
        class="drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @keydown="keydown"
      >
        <LiquidGlassSurface
          :tint-opacity="0.94"
          :radius="24"
          class="drawer-surface"
          ><header>
            <div>
              <p class="eyebrow">DETAILS & SERVICE</p>
              <h2>{{ title }}</h2>
              <p v-if="subtitle" class="muted">{{ subtitle }}</p>
            </div>
            <LiquidGlassButton aria-label="关闭详情" @click="emit('close')"
              ><ChevronLeft
                v-if="mobilePage"
                class="staff-back-icon"
                :size="20" /><X
                :class="{ 'staff-close-icon': mobilePage }"
                :size="18"
            /></LiquidGlassButton>
          </header>
          <div class="drawer-body"><slot /></div
        ></LiquidGlassSurface>
      </aside></div
  ></Teleport>
</template>
