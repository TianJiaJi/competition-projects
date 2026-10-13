<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { ContourBackground } from "@scene/ui/contour";
import { LiquidGlassSurface } from "@scene/ui/liquid-glass";
import type {
  PreviewContext,
  RunState,
  SampleDefinition,
  NodeActionFeedback,
} from "@scene/demo/builder-types";
import WorkflowNode from "./WorkflowNode.vue";
import { arrange, route, currentNode, type Box } from "./graph-layout";
const props = defineProps<{
  definition: SampleDefinition;
  state: RunState;
  busy: boolean;
  statuses: Record<string, string>;
  feedback: Record<string, NodeActionFeedback>;
}>();
const emit = defineEmits<{
  action: [body: Record<string, unknown>];
  open: [context: PreviewContext, port: number];
}>();
const viewport = ref<HTMLElement>();
const transform = reactive({ x: 40, y: 50, scale: 0.9 }),
  dragging = ref(false),
  hovered = ref("");
const geometry = computed(() => arrange(props.definition));
const positions = computed(() => geometry.value.boxes);
const current = computed(() =>
  currentNode(props.definition.workflow, props.state.nodes, props.feedback),
);
const byId = computed(() =>
  Object.fromEntries(props.definition.workflow.map((n) => [n.id, n])),
);
const edges = computed(() =>
  props.definition.workflow.flatMap((n) =>
    n.deps.map((dep) => ({
      from: dep,
      to: n.id,
      role: n.stage,
      sourceRole: byId.value[dep].stage,
      id: `${dep}-${n.id}`,
      label: n.inputs?.[dep] || "产物交接",
      major:
        byId.value[dep].module !== n.module ||
        byId.value[dep].kind === "acceptance",
    })),
  ),
);
const routes = computed(() => {
  const labels: { x: number; y: number; width: number }[] = [];
  return Object.fromEntries(
    edges.value.map((edge, i) => {
      const a = byId.value[edge.from],
        b = byId.value[edge.to];
      const obstacles = [...Object.values(positions.value)];
      // Inter-module handoffs use the outside of unrelated modules.
      if (a.module !== b.module)
        for (const m of geometry.value.modules)
          if (m.id !== a.module && m.id !== b.module)
            obstacles.push(geometry.value.bounds[m.id]);
      const path = route(
        positions.value[edge.from],
        positions.value[edge.to],
        obstacles,
        i,
      );
      const width = edge.label.length * 12 + 12;
      for (const segment of [...path.segments]
        .filter((s) => s.a.y === s.b.y && s.length > width)
        .sort((a, b) => b.length - a.length)) {
        const x = (segment.a.x + segment.b.x) / 2,
          y = segment.a.y - 10;
        if (
          !labels.some(
            (l) =>
              Math.abs(l.y - y) < 24 &&
              Math.abs(l.x - x) < (l.width + width) / 2,
          )
        ) {
          path.label = { x, y };
          break;
        }
      }
      if (edge.major) labels.push({ ...path.label, width });
      return [edge.id, path];
    }),
  );
});
function related(e: { from: string; to: string }) {
  return hovered.value === e.from || hovered.value === e.to;
}
function fitBoxes(boxes: Box[], minimum = 0.88) {
  if (!viewport.value || !boxes.length) return;
  const r = viewport.value.getBoundingClientRect(),
    minX = Math.min(...boxes.map((b) => b.x)),
    minY = Math.min(...boxes.map((b) => b.y));
  const width = Math.max(...boxes.map((b) => b.x + b.width)) - minX,
    height = Math.max(...boxes.map((b) => b.y + b.height)) - minY;
  transform.scale = Math.max(
    minimum,
    Math.min(1, (r.width - 80) / width, (r.height - 150) / height),
  );
  transform.x =
    Math.max(40, (r.width - width * transform.scale) / 2) -
    minX * transform.scale;
  transform.y = 78 - minY * transform.scale;
}
function focus(id: string) {
  if (positions.value[id]) fitBoxes([positions.value[id]], 0.88);
}
function moduleFocus(id: string) {
  const b = geometry.value.bounds[id];
  if (b) fitBoxes([b]);
}
function fit() {
  fitBoxes(Object.values(positions.value), 0.04);
}
function locate() {
  if (current.value) focus(current.value.id);
}
function zoom(factor: number, clientX?: number, clientY?: number) {
  if (!viewport.value) return;
  const r = viewport.value.getBoundingClientRect(),
    x = (clientX ?? r.left + r.width / 2) - r.left,
    y = (clientY ?? r.top + r.height / 2) - r.top;
  const scale = Math.max(0.04, Math.min(1.5, transform.scale * factor)),
    ratio = scale / transform.scale;
  transform.x = x - (x - transform.x) * ratio;
  transform.y = y - (y - transform.y) * ratio;
  transform.scale = scale;
}
let drag: {
  x: number;
  y: number;
  left: number;
  top: number;
  pointer: number;
} | null = null;
function scrollbar(target: HTMLElement, e: PointerEvent) {
  for (
    let el: HTMLElement | null = target;
    el && el !== viewport.value;
    el = el.parentElement
  ) {
    const r = el.getBoundingClientRect(),
      scale = r.width / el.offsetWidth;
    if (
      el.scrollHeight > el.clientHeight + 1 &&
      el.offsetWidth - el.clientWidth > 2 &&
      e.clientX > r.right - (el.offsetWidth - el.clientWidth) * scale
    )
      return true;
    if (
      el.scrollWidth > el.clientWidth + 1 &&
      el.offsetHeight - el.clientHeight > 2 &&
      e.clientY > r.bottom - (el.offsetHeight - el.clientHeight) * scale
    )
      return true;
  }
  return false;
}
function down(e: PointerEvent) {
  const target = e.target as HTMLElement;
  if (
    e.button !== 0 ||
    target.closest(
      "button,a,input,textarea,select,summary,.drop-input,.canvas-toolbar,.flow-navigation",
    ) ||
    scrollbar(target, e)
  )
    return;
  e.preventDefault();
  drag = {
    x: e.clientX,
    y: e.clientY,
    left: transform.x,
    top: transform.y,
    pointer: e.pointerId,
  };
  viewport.value?.setPointerCapture(e.pointerId);
}
function move(e: PointerEvent) {
  if (
    !drag ||
    (!dragging.value && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4)
  )
    return;
  e.preventDefault();
  dragging.value = true;
  window.getSelection()?.removeAllRanges();
  transform.x = drag.left + e.clientX - drag.x;
  transform.y = drag.top + e.clientY - drag.y;
}
function release() {
  if (drag && viewport.value?.hasPointerCapture(drag.pointer))
    viewport.value.releasePointerCapture(drag.pointer);
  drag = null;
  dragging.value = false;
}
function wheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) {
    for (
      let el: HTMLElement | null = e.target as HTMLElement;
      el && el !== viewport.value;
      el = el.parentElement
    ) {
      const style = getComputedStyle(el);
      if (
        (/(auto|scroll)/.test(style.overflowY) &&
          el.scrollHeight > el.clientHeight + 1) ||
        (/(auto|scroll)/.test(style.overflowX) &&
          el.scrollWidth > el.clientWidth + 1)
      )
        return;
    }
  }
  e.preventDefault();
  if (e.ctrlKey || e.metaKey)
    zoom(Math.exp(-e.deltaY * 0.006), e.clientX, e.clientY);
  else {
    transform.x -= e.deltaX;
    transform.y -= e.deltaY;
  }
}
const cameraKey = () => `assembly.camera.${props.state.run}`;
function restore() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(cameraKey()) || "null");
  } catch {}
  if (
    saved &&
    [saved.x, saved.y, saved.scale].every(Number.isFinite) &&
    saved.scale >= 0.04 &&
    saved.scale <= 1.5
  )
    Object.assign(transform, saved);
  else fit();
}
watch(transform, () => {
  try {
    localStorage.setItem(cameraKey(), JSON.stringify(transform));
  } catch {}
});
watch(
  () => props.state.run,
  async () => {
    release();
    await nextTick();
    restore();
  },
);
onMounted(async () => {
  await nextTick();
  restore();
  viewport.value?.addEventListener("wheel", wheel, { passive: false });
  window.addEventListener("blur", release);
});
onBeforeUnmount(() => {
  viewport.value?.removeEventListener("wheel", wheel);
  window.removeEventListener("blur", release);
  release();
});
defineExpose({ focus, locate, fit });
</script>
<template>
  <main
    ref="viewport"
    class="canvas-viewport"
    :class="{ dragging }"
    aria-label="连续工作流画布"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="release"
    @pointercancel="release"
    @lostpointercapture="release"
  >
    <ContourBackground
      class="canvas-terrain"
      background-color="#f5f7fb"
      line-color="#58749b"
      :line-opacity="0.1"
    />
    <div class="canvas-toolbar">
      <LiquidGlassSurface class="current-indicator" :tint-opacity="0.8"
        ><span>{{
          current?.title || "暂无待处理事项"
        }}</span></LiquidGlassSurface
      ><LiquidGlassSurface class="row" :tint-opacity="0.8"
        ><button aria-label="缩小" @click="zoom(0.8)">−</button
        ><span>{{ Math.round(transform.scale * 100) }}%</span
        ><button aria-label="放大" @click="zoom(1.25)">＋</button
        ><button @click="fit">全图</button
        ><button :disabled="!current" @click="locate">定位当前</button
        ><select
          aria-label="定位节点"
          @change="focus(($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled selected>定位节点…</option>
          <option v-for="n in definition.workflow" :key="n.id" :value="n.id">
            {{ n.stage }} · {{ n.title }}
          </option>
        </select></LiquidGlassSurface
      >
    </div>
    <div
      class="canvas-world"
      :style="{
        transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`,
      }"
    >
      <svg class="connections" aria-hidden="true">
        <defs>
          <marker
            v-for="role in ['01', '02', '03', '04']"
            :key="role"
            :id="'arrow-' + role"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 Z" :fill="`var(--role-${role})`" />
          </marker>
          <linearGradient
            v-for="e in edges"
            :key="e.id"
            :id="'edge-color-' + e.id"
            gradientUnits="userSpaceOnUse"
            :x1="positions[e.from].x"
            :y1="positions[e.from].y"
            :x2="positions[e.to].x"
            :y2="positions[e.to].y"
          >
            <stop offset="0%" :stop-color="`var(--role-${e.sourceRole})`" />
            <stop offset="85%" :stop-color="`var(--role-${e.role})`" />
          </linearGradient>
        </defs>
        <g v-for="e in edges" :key="e.id">
          <path
            :d="routes[e.id].d"
            :stroke="`url(#edge-color-${e.id})`"
            :marker-end="`url(#arrow-${e.role})`"
            :class="[
              'flow-edge',
              {
                'edge-complete': state.nodes[e.from]?.status === 'complete',
                'edge-active': state.nodes[e.to]?.status === 'running',
                'edge-related': related(e),
                'edge-muted': hovered && !related(e),
              },
            ]"
          />
          <text
            v-if="e.major || related(e)"
            class="edge-label"
            :x="routes[e.id].label.x"
            :y="routes[e.id].label.y"
            :fill="`var(--role-${e.role})`"
          >
            {{ e.label }}
          </text>
        </g>
      </svg>
      <div
        v-for="node in definition.workflow"
        :key="state.run + node.id"
        class="node-position"
        :style="{
          left: positions[node.id].x + 'px',
          top: positions[node.id].y + 'px',
          width: positions[node.id].width + 'px',
          height: positions[node.id].height + 'px',
        }"
        @pointerenter="hovered = node.id"
        @pointerleave="hovered = ''"
      >
        <WorkflowNode
          :node="node"
          :state="state"
          :definition="definition"
          :busy="busy"
          :statuses="statuses"
          :feedback="feedback[node.id]"
          @action="emit('action', $event)"
          @open="(c, p) => emit('open', c, p)"
        />
      </div>
    </div>
    <LiquidGlassSurface
      as="nav"
      class="flow-navigation"
      aria-label="流程导航"
      :tint-opacity="0.85"
      ><button
        v-for="m in geometry.modules"
        :key="m.id"
        @click="moduleFocus(m.id)"
      >
        <i :style="{ background: `var(--role-${m.role})` }"></i>{{ m.title }}
      </button></LiquidGlassSurface
    >
  </main>
</template>
