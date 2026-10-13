<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
const props = withDefaults(
  defineProps<{ progress?: number; label?: string }>(),
  { progress: 0, label: "景区加载进度" },
);
const emit = defineEmits<{ complete: [] }>();
const percentage = computed(() =>
  Math.round(
    Math.max(
      0,
      Math.min(100, Number.isFinite(props.progress) ? props.progress : 0),
    ),
  ),
);
let completion: ReturnType<typeof setTimeout> | undefined;
// Complete only after the final ink transition has painted; reset cancels completion.
watch(
  percentage,
  (value) => {
    clearTimeout(completion);
    if (value === 100)
      completion = setTimeout(
        () => emit("complete"),
        typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 300,
      );
  },
  { immediate: true, flush: "post" },
);
onBeforeUnmount(() => clearTimeout(completion));
</script>
<template>
  <div
    class="ink-progress"
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="percentage"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :style="{ '--ink-progress': percentage / 100 }"
  >
    <span class="ink-path ink-left" aria-hidden="true"
      ><i class="ink-flow"
    /></span>
    <span class="ink-percentage">{{ percentage }}<small>%</small></span>
    <span class="ink-path ink-right" aria-hidden="true"
      ><i class="ink-flow"
    /></span>
  </div>
</template>
<style scoped>
.ink-progress {
  position: relative;
  width: 100%;
  height: 64px;
  pointer-events: none;
  color: #294a43;
}
.ink-path {
  position: absolute;
  top: 20px;
  width: calc(50% - 60px);
  height: 25px;
}
.ink-left {
  left: 0;
}
.ink-right {
  right: 0;
}
.ink-percentage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font: 500 36px/1 var(--serif, "Songti SC", serif);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 8px #f7f5ee;
}
.ink-percentage small {
  font-size: 18px;
  align-self: center;
  margin-top: 10px;
  opacity: 0.75;
}
.ink-path {
  position: absolute;
  top: 20px;
  width: calc(50% - 60px);
  height: 25px;
}
.ink-left {
  left: 0;
}
.ink-right {
  right: 0;
}
.ink-flow {
  position: absolute;
  inset: 0;
  display: block;
  transform: scaleX(var(--ink-progress));
  transform-origin: left center;
  transition: transform 0.28s ease-out;
  border-radius: 0 63% 48% 0 / 0 55% 67% 0;
  background: linear-gradient(
    176deg,
    transparent 5%,
    #294a4350 18%,
    #284c43d9 43%,
    #1f3b35ec 52%,
    #3f615582 73%,
    transparent 94%
  );
  filter: drop-shadow(0 2px 3px #38544626);
}
.ink-right .ink-flow {
  transform-origin: right center;
  border-radius: 57% 0 0 72% / 68% 0 0 47%;
  background: linear-gradient(
    184deg,
    transparent 5%,
    #294a4350 18%,
    #284c43d9 43%,
    #1f3b35ec 52%,
    #3f615582 73%,
    transparent 94%
  );
}
.ink-flow::before {
  content: "";
  position: absolute;
  inset: 5px -4px 3px 0;
  border-radius: 48%;
  background: repeating-linear-gradient(
    178deg,
    transparent 0 2px,
    #f4f1e980 3px,
    transparent 4px 7px
  );
  opacity: 0.55;
}
.ink-flow::after {
  content: "";
  position: absolute;
  right: -7px;
  top: 8px;
  width: 18px;
  height: 12px;
  border-radius: 65% 38% 55% 42%;
  background: #28473cd9;
  box-shadow:
    5px 1px 0 -4px #345347aa,
    11px -4px 0 -5px #34534770;
}
.ink-right .ink-flow::after {
  right: auto;
  left: -7px;
  transform: scaleX(-1);
}
@media (prefers-reduced-motion: reduce) {
  .ink-flow {
    transition: none;
  }
}
@media (forced-colors: active) {
  .ink-flow {
    background: CanvasText;
    filter: none;
  }
  .ink-percentage {
    color: CanvasText;
    text-shadow: none;
  }
}
</style>
