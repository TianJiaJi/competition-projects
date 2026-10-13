<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import type { Frame, LoadEvent } from "./types";
const props = withDefaults(
  defineProps<{
    frames: Frame[];
    label: string;
    kind?: "latency" | "load";
    duration?: number;
    concurrency?: number;
    rps?: number;
    latencyMax?: number;
    events?: LoadEvent[];
    compact?: boolean;
    prominent?: boolean;
  }>(),
  { kind: "latency", events: () => [] },
);
const container = ref<HTMLElement | null>(null),
  width = ref(600);
const gradientId = `chart-${useId().replace(/:/g, "")}`;
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    width.value = Math.max(250, Math.round(entry.contentRect.width));
  });
  if (container.value) observer.observe(container.value);
});
onBeforeUnmount(() => observer?.disconnect());
const height = computed(() =>
  props.prominent
    ? Math.min(270, Math.max(210, Math.round(width.value * 0.62)))
    : props.compact ? 150 : 215,
),
  bottom = computed(() => height.value - 30);
const rightInset = computed(() => props.prominent && props.kind === "latency" ? 18 : 52);
const horizon = computed(
  () => props.duration || Math.max(24, ...props.frames.map((f) => f.second)),
);
const leftMax = computed(() =>
  props.kind === "load"
    ? props.concurrency || 1000
    : props.latencyMax ||
      Math.max(
        120,
        Math.ceil(Math.max(0, ...props.frames.map((f) => f.p95)) / 50) * 50,
      ),
);
const rightMax = computed(() => {
  const maximum = Math.max(120, props.rps || 0, ...props.frames.map(frame => frame.rps));
  const step = 10 ** Math.floor(Math.log10(maximum));
  return Math.ceil(maximum / step) * step;
});
const x = (second: number) =>
  43 + Math.max(0, Math.min(1, second / horizon.value)) * (width.value - 43 - rightInset.value);
const y = (value: number, max = leftMax.value) =>
  bottom.value - Math.max(0, Math.min(1, value / max)) * (bottom.value - 25);
const series = (
  key: "concurrency" | "rps" | "p50" | "p95",
  max = leftMax.value,
) =>
  props.frames
    .map((frame) => `${x(frame.second)},${y(frame[key], max)}`)
    .join(" ");
const area = computed(() =>
  props.frames.length
    ? `${x(props.frames[0].second)},${bottom.value} ${series(props.kind === "load" ? "concurrency" : "p95")} ${x(props.frames.at(-1)!.second)},${bottom.value}`
    : "",
);
const last = computed(() => props.frames.at(-1));
</script>
<template>
  <div ref="container" class="trend-chart" :class="{ compact, prominent }">
    <svg :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="label">
      <defs>
        <linearGradient :id="gradientId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b8066" stop-opacity=".22" />
          <stop offset="100%" stop-color="#3b8066" stop-opacity=".02" />
        </linearGradient>
      </defs>
      <g v-for="tick in [0, 0.25, 0.5, 0.75, 1]" :key="tick">
        <line
          x1="43"
          :x2="width - rightInset"
          :y1="y(leftMax * tick)"
          :y2="y(leftMax * tick)"
          stroke="#e1e9e2"
          stroke-dasharray="3 5"
        />
        <text x="33" :y="y(leftMax * tick) + 3" text-anchor="end">
          {{ Math.round(leftMax * tick) }}
        </text>
        <text
          v-if="kind === 'load'"
          :x="width - 41"
          :y="y(leftMax * tick) + 3"
          class="axis-amber"
        >
          {{ Math.round(rightMax * tick) }}
        </text>
      </g>
      <text x="12" y="12">{{ kind === "load" ? "并发" : "ms" }}</text>
      <text
        v-if="kind === 'load'"
        :x="width - 10"
        y="12"
        text-anchor="end"
        class="axis-amber"
      >
        req/s
      </text>
      <polygon
        v-if="frames.length"
        :points="area"
        :fill="`url(#${gradientId})`"
      />
      <polyline
        :points="series(kind === 'load' ? 'concurrency' : 'p50')"
        fill="none"
        stroke="#286c52"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <polyline
        :points="
          series(
            kind === 'load' ? 'rps' : 'p95',
            kind === 'load' ? rightMax : leftMax,
          )
        "
        fill="none"
        :stroke="kind === 'load' ? '#c99a43' : '#8fa887'"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <g
        v-for="event in events.filter((e) => e.type === 'manual')"
        :key="event.id"
        class="chart-event"
      >
        <line
          :x1="x(event.second)"
          :x2="x(event.second)"
          y1="24"
          :y2="bottom"
          stroke="#bd8e35"
          stroke-dasharray="3 4"
        />
        <circle
          :cx="x(event.second)"
          cy="20"
          r="7"
          fill="#faf2dd"
          stroke="#c99a43"
        />
        <text
          :x="x(event.second)"
          y="23"
          text-anchor="middle"
          class="axis-amber"
        >
          +
        </text>
        <title>
          {{ event.second.toFixed(1) }} s · 手动加压至第 {{ event.level }} 级 /
          {{ event.concurrency }} 并发
        </title>
      </g>
      <circle
        v-if="last"
        :cx="x(last.second)"
        :cy="y(kind === 'load' ? last.concurrency : last.p50)"
        :r="prominent ? 4 : 3.5"
        fill="#286c52"
        class="chart-cursor"
      />
      <g v-for="(frame, index) in frames" :key="index">
        <rect
          :x="x(frame.second) - 4"
          y="28"
          width="8"
          :height="bottom - 28"
          fill="transparent"
        >
          <title>
            {{ frame.second.toFixed(1) }} s · 并发 {{ frame.concurrency }} ·
            {{ frame.rps.toFixed(1) }} req/s · P50 {{ frame.p50 }} ms · P95
            {{ frame.p95 }} ms
          </title>
        </rect>
      </g>
      <text
        v-for="tick in [0, 0.25, 0.5, 0.75, 1]"
        :key="`x-${tick}`"
        :x="x(horizon * tick)"
        :y="height - 8"
        text-anchor="middle"
      >
        {{ Math.round(horizon * tick) }} s
      </text>
      <text
        v-if="!frames.length"
        :x="width / 2"
        :y="height / 2"
        text-anchor="middle"
      >
        启动测试，观察负载逐级上升
      </text>
    </svg>
  </div>
</template>
