<script setup lang="ts">
import { onMounted, onBeforeUnmount, shallowRef, ref } from "vue";
const props = defineProps<{ source: string; target: string }>();
const svg = ref<SVGSVGElement>();
const line = shallowRef<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null>(null);
let frame = 0;
// Track the actual marker button, including its collision offset, during camera flights.
function measure() {
  frame = requestAnimationFrame(measure);
  const scope = svg.value?.closest(".model-browser,.community-stage");
  const source = scope?.querySelector<HTMLElement>(props.source);
  const target = scope?.querySelector<HTMLElement>(props.target);
  if (!source || !target || !svg.value) {
    line.value = null;
    return;
  }
  const view = svg.value.getBoundingClientRect(),
    a = source.getBoundingClientRect(),
    b = target.getBoundingClientRect();
  if (!a.width || !a.height || !b.width || !view.width) {
    line.value = null;
    return;
  }
  const x = a.left + a.width / 2,
    y = a.top + a.height / 2;
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  let x2: number, y2: number;
  if (a.right < b.left || a.left > b.right) {
    x2 = x < b.left ? b.left : b.right;
    // Scenic guide: connect to the card edge at the viewport's vertical center.
    y2 = clamp(view.top + view.height / 2, b.top + 18, b.bottom - 18);
  } else if (y < b.top || y > b.bottom) {
    x2 = clamp(x, b.left + 18, b.right - 18);
    y2 = y < b.top ? b.top : b.bottom;
  } else {
    line.value = null;
    return;
  }
  const dx = x2 - x,
    dy = y2 - y;
  const t = Math.min(
    1,
    a.width / 2 / Math.max(Math.abs(dx), 0.001),
    a.height / 2 / Math.max(Math.abs(dy), 0.001),
  );
  const next = {
    x1: x + dx * t - view.left,
    y1: y + dy * t - view.top,
    x2: x2 - view.left,
    y2: y2 - view.top,
  };
  if (
    !line.value ||
    Object.keys(next).some(
      (k) =>
        Math.abs(
          next[k as keyof typeof next] - line.value![k as keyof typeof next],
        ) > 0.1,
    )
  )
    line.value = next;
}
onMounted(measure);
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>
<template>
  <svg ref="svg" class="community-card-leader" aria-hidden="true">
    <g v-if="line">
      <line v-bind="line" />
      <circle :cx="line.x2" :cy="line.y2" r="3" />
    </g>
  </svg>
</template>
<style scoped>
.community-card-leader {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  z-index: 9;
}
line {
  stroke: var(--brand);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-opacity: 0.7;
  filter: drop-shadow(0 1px 1px var(--surface));
}
circle {
  fill: var(--surface);
  stroke: var(--brand);
  stroke-width: 1.5;
}
</style>
