<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import type { Frame, LoadEvent } from "./types";
import { chartAxis, formatAxisTick, timeTicks } from './chart-axis';
import { LOAD_DEFAULTS } from './load-goal';
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
    showTarget?: boolean;
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
const leftInset = computed(() => Math.max(43, ...leftAxis.value.ticks.map(tick => formatAxisTick(tick).length * 7 + 16)));
const rightInset = computed(() => props.kind === 'load' ? Math.max(50, ...rightAxis.value.ticks.map(tick => formatAxisTick(tick).length * 7 + 20)) : 18);
const horizon = computed(
  () => props.duration || Math.max(24, ...props.frames.map((f) => f.second)),
);
const leftAxis = computed(() => props.kind === 'load'
  ? chartAxis(Math.max(props.concurrency || LOAD_DEFAULTS.concurrency, ...props.frames.map(frame => frame.concurrency)), true)
  : chartAxis(Math.max(props.latencyMax || 120, ...props.frames.map(frame => frame.p95))));
const rightAxis = computed(() => chartAxis(Math.max(120, props.rps || 0, ...props.frames.map(frame => frame.rps))));
const leftMax = computed(() => leftAxis.value.max), rightMax = computed(() => rightAxis.value.max);
const seconds = computed(() => timeTicks(horizon.value));
const x = (second: number) =>
  leftInset.value + Math.max(0, Math.min(1, second / horizon.value)) * (width.value - leftInset.value - rightInset.value);
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
      <g class="axis-left">
        <g v-for="tick in leftAxis.ticks" :key="tick">
          <line :x1="leftInset" :x2="width - rightInset" :y1="y(tick)" :y2="y(tick)" stroke="#e1e9e2" stroke-dasharray="3 5"/>
          <text class="axis-tick" :x="leftInset - 10" :y="y(tick) + 3" text-anchor="end">{{ formatAxisTick(tick) }}</text>
        </g>
      </g>
      <g v-if="kind === 'load'" class="axis-right axis-amber">
        <g v-for="tick in rightAxis.ticks" :key="tick">
          <line :x1="width - rightInset" :x2="width - rightInset + 4" :y1="y(tick, rightMax)" :y2="y(tick, rightMax)" stroke="#d8c8a7"/>
          <text class="axis-tick axis-amber" :x="width - rightInset + 10" :y="y(tick, rightMax) + 3">{{ formatAxisTick(tick) }}</text>
        </g>
      </g>
      <text class="axis-unit" :x="leftInset - 10" y="12" text-anchor="end">{{ kind === 'load' ? '并发' : 'ms' }}</text>
      <text v-if="kind === 'load'" class="axis-unit axis-amber" :x="width - rightInset + 10" y="12">req/s</text>
      <g v-if="kind==='load' && showTarget && concurrency" class="goal-target-line">
        <line :x1="leftInset" :x2="width-rightInset" :y1="y(concurrency)" :y2="y(concurrency)" stroke="#a7813f" stroke-dasharray="5 5"/>
        <text :x="width-rightInset-4" :y="y(concurrency)+12" text-anchor="end" class="axis-tick axis-amber">目标 {{formatAxisTick(concurrency)}}</text>
      </g>
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
        v-for="(tick, index) in seconds"
        :key="`x-${tick}`"
        class="axis-time"
        :x="x(tick)"
        :y="height - 8"
        :text-anchor="index === 0 ? 'start' : index === seconds.length - 1 ? 'end' : 'middle'"
      >
        {{ formatAxisTick(tick) }} s
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
<style scoped>
.trend-chart { min-width:0; }
svg { display:block; width:100%; height:auto; }
text { font:11px var(--mono,Consolas,monospace); font-variant-numeric:tabular-nums; fill:#718568; }
.axis-unit { font-size:10px; fill:#607659; }
.axis-amber { fill:#a27c3e; }
</style>
