<script setup lang="ts">
import {
  computed,
  reactive,
  ref,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import {
  C01,
  VERSION,
  nodes,
  groups,
  createWorkflow,
  canExecute,
  invalidate,
  resetGroup,
  directTo,
  log,
  currentReport,
  automatedPassed,
  deliveryReady,
  exportReport,
  manualDefinitions,
  referenceInput,
  validateCase,
  runChecks,
  type Group,
  type WorkflowNode,
  type DemoStage,
} from "@scene/demo";
import {
  ResultBridge,
  type Context,
  type BridgeStatus,
} from "@scene/demo/bridge";
import { materials } from "@scene/demo/materials";
import { scenario } from "../../../scenario/config";
const w = reactive(createWorkflow());
const stage = ref<Group>("map");
const selected = ref<string | null>(null);
const tab = ref("");
const full = ref(false),
  fontSize = ref(15);
const alert = ref("");
const recovery = ref(false),
  fallback = ref(false),
  confirmReset = ref(false);
const reportOpen = ref(false),
  archivedReports = ref<ReturnType<typeof exportReport>[]>([]);
const viewport = ref<HTMLElement>();
const transform = reactive({ x: 0, y: 0, scale: 0.6 });
const intents = new Map<
  number,
  { node?: string; reset: boolean; epoch: number }
>();
let epoch = 0;
const pageStates = reactive<
  Record<string, { status: BridgeStatus; detail: string }>
>({});
const resetting = ref(false);
const pendingResets = new Set<number>();
const refreshed = performance
  .getEntriesByType("navigation")
  .some((e) => (e as PerformanceNavigationTiming).type === "reload");
const needsReset = ref(refreshed);
const selectedNode = computed(() => nodes.find((n) => n.id === selected.value));
const selectedMaterial = computed(() => materials[tab.value]);
const report = computed(() => currentReport(w));
const materialsText = computed(() =>
  tab.value === "T03"
    ? JSON.stringify(
        report.value ?? { status: "尚未执行或上游已变更，需重新运行" },
        null,
        2,
      )
    : tab.value === "T04"
      ? JSON.stringify(w.manual, null, 2)
      : (selectedMaterial.value?.text ?? ""),
);
const visibleText = computed(() =>
  full.value
    ? materialsText.value
    : (selectedMaterial.value?.preview ?? materialsText.value)
        .split("\n")
        .slice(0, 12)
        .join("\n"),
);
const validation = computed(() => validateCase(referenceInput(!w.corrected)));
const labelStatus: Record<string, string> = {
  pending: "未开始",
  running: "处理中",
  produced: "已产出",
  passed: "已通过",
  failed: "已拦截 / 失败",
  preloaded: "预载 · 未执行",
  stale: "待重跑",
  ready: "可执行",
};
const nextNode = computed(() =>
  nodes.find(
    (n) =>
      canExecute(w, n.id) && !["produced", "passed"].includes(w.statuses[n.id]),
  ),
);
const displayStatus = (id: string) =>
  w.statuses[id] === "pending" && canExecute(w, id) ? "ready" : w.statuses[id];
const runnable = (id: string) =>
  !needsReset.value && !resetting.value && canExecute(w, id);
const port = (stage: DemoStage) => (stage === "campus-map" ? 5500 : 5503);
const bridge = new ResultBridge((context, status, detail) => {
  if (context.run !== w.run) return;
  pageStates[context.stage] = { status, detail };
  const intent = intents.get(port(context.stage));
  if (status === "reloaded") {
    invalidate(w, ["manual"]);
    log(w, context.stage, "page-reloaded", detail);
    return;
  }
  if (status === "closed") {
    log(w, context.stage, "page-closed", detail);
    if (context.stage === "campus-ready") {
      invalidate(w, ["manual"]);
      w.statuses.frontend = "stale";
    }
    if (context.stage === "campus-map") {
      w.statuses.map = "stale";
      invalidate(w, ["manual"]);
    }
    return;
  }
  if (intent && intent.epoch !== epoch) return;
  if (status === "waiting") {
    if (intent?.node) w.statuses[intent.node] = "running";
    return;
  }
  if (status === "ready") {
    if (intent?.node) {
      w.statuses[intent.node] = "passed";
      log(w, intent.node, "page-ready", { ...context, detail });
    }
    if (intent?.reset) {
      pendingResets.delete(port(context.stage));
      resetting.value = pendingResets.size > 0;
    }
  } else {
    if (intent?.node) w.statuses[intent.node] = "failed";
    log(w, context.stage, "page-error", detail);
    alert.value = detail;
  }
});
function openResult(stage: DemoStage, node?: string, reload = false) {
  intents.set(port(stage), { node, reset: false, epoch });
  bridge.open({ stage, run: w.run }, reload);
}
function showNode(node: WorkflowNode) {
  selected.value = node.id;
  tab.value = node.materials[0];
  full.value = false;
  stage.value = node.group;
  nextTick(() =>
    document.querySelector<HTMLButtonElement>(".drawer-close")?.focus(),
  );
}
function focusBounds(x: number, y: number, width: number, height: number) {
  if (!viewport.value) return;
  const bounds = viewport.value.getBoundingClientRect();
  transform.scale = Math.min(
    (bounds.width - 100) / width,
    (bounds.height - 100) / height,
    1.25,
  );
  transform.x =
    (bounds.width - width * transform.scale) / 2 - x * transform.scale;
  transform.y =
    (bounds.height - height * transform.scale) / 2 - y * transform.scale;
}
function fit() {
  focusBounds(0, 0, 2430, 920);
}
function focusGroup(id: Group) {
  stage.value = id;
  const group = groups.find((g) => g.id === id)!;
  focusBounds(group.x, group.y, group.width, group.height);
}
function focusNext() {
  if (nextNode.value) {
    focusGroup(nextNode.value.group);
    alert.value = `下一步：${nextNode.value.label}，点击节点查看并执行。`;
  }
}
function zoom(factor: number, clientX?: number, clientY?: number) {
  if (!viewport.value) return;
  const rect = viewport.value.getBoundingClientRect();
  const x = (clientX ?? rect.left + rect.width / 2) - rect.left,
    y = (clientY ?? rect.top + rect.height / 2) - rect.top;
  const next = Math.max(0.25, Math.min(1.65, transform.scale * factor));
  const ratio = next / transform.scale;
  transform.x = x - (x - transform.x) * ratio;
  transform.y = y - (y - transform.y) * ratio;
  transform.scale = next;
}
let drag: {
  x: number;
  y: number;
  left: number;
  top: number;
  id: number;
} | null = null;
function pointerDown(e: PointerEvent) {
  if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
  drag = {
    x: e.clientX,
    y: e.clientY,
    left: transform.x,
    top: transform.y,
    id: e.pointerId,
  };
  viewport.value?.setPointerCapture(e.pointerId);
}
function pointerMove(e: PointerEvent) {
  if (drag) {
    transform.x = drag.left + e.clientX - drag.x;
    transform.y = drag.top + e.clientY - drag.y;
  }
}
function pointerUp() {
  drag = null;
}
function path(from: string, to: WorkflowNode) {
  const a = nodes.find((n) => n.id === from)!;
  const x1 = a.x + 240,
    y1 = a.y + 47,
    x2 = to.x,
    y2 = to.y + 47;
  return `M ${x1} ${y1} C ${x1 + 65} ${y1}, ${x2 - 65} ${y2}, ${x2} ${y2}`;
}
async function execute(node: WorkflowNode) {
  if (!runnable(node.id)) return;
  alert.value = "";
  if (node.id === "manual") {
    tab.value = "T04";
    return;
  }
  if (node.id === "delivery") {
    if (!deliveryReady(w)) {
      alert.value =
        "交付尚未完成：需要真实页面应用、自动检查通过及全部人工证据。";
      return;
    }
    w.statuses.delivery = "passed";
    log(w, "delivery", "accepted", "本轮交付完成");
    return;
  }
  const targets: Record<string, DemoStage> = {
    map: "campus-map",
    template: "template",
    frontend: "campus-ready",
  };
  if (targets[node.id]) {
    openResult(targets[node.id], node.id);
    return;
  }
  w.statuses[node.id] = "running";
  await nextTick();
  try {
    if (node.id === "reference") {
      const result = validateCase(referenceInput(!w.corrected));
      w.statuses.reference = result.valid ? "passed" : "failed";
      if (!result.valid) w.rejectedOnce = true;
      log(
        w,
        "reference",
        result.valid ? "validation-passed" : "validation-rejected",
        result,
      );
      alert.value = result.valid
        ? "T1 → F4 → B1 引用通过"
        : result.errors.join("；");
    } else if (node.id === "test") {
      w.reports.forEach((r) => (r.valid = false));
      invalidate(w, ["manual"]);
      const result = runChecks(scenario, w.run);
      w.reports.push({ valid: true, report: result });
      w.statuses.test = result.results.every((r) => r.passed)
        ? "passed"
        : "failed";
      log(w, "test", "actual-checks", result);
      tab.value = "T03";
    } else {
      w.statuses[node.id] = "produced";
      log(w, node.id, "material-loaded", {
        materials: node.materials,
        version: VERSION,
      });
    }
  } catch (error) {
    w.statuses[node.id] = "failed";
    const detail = error instanceof Error ? error.message : String(error);
    log(w, node.id, "execution-error", detail);
    alert.value = detail;
  }
}
function cancelPending() {
  epoch++;
  bridge.cancel();
  for (const node of nodes)
    if (w.statuses[node.id] === "running") {
      w.statuses[node.id] = "stale";
      log(w, node.id, "cancelled", "恢复操作取消了待确认动作，请重新执行");
    }
  intents.clear();
}
function changeReference(corrected: boolean) {
  if (!runnable("reference") || (corrected && !w.rejectedOnce && !w.rehearsal))
    return;
  cancelPending();
  invalidate(w, ["reference"]);
  w.corrected = corrected;
  w.statuses.reference = "pending";
  tab.value = corrected ? "S04" : "S03";
  log(w, "reference", "input-changed", corrected ? "S04" : "S03");
}
function manualSave(index: number, status: "passed" | "failed") {
  if (!automatedPassed(w) || !w.manual[index].evidence.trim()) {
    alert.value = "先完成自动检查，并填写实际观察证据。";
    return;
  }
  const item = w.manual[index];
  item.status = status;
  item.at = new Date().toISOString();
  w.statuses.delivery = "stale";
  log(w, "manual", "manual-evidence", { ...item });
  w.statuses.manual = w.manual.every((m) => m.status === "passed")
    ? "passed"
    : w.manual.some((m) => m.status === "failed")
      ? "failed"
      : "pending";
}
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function resetAcceptance() {
  invalidate(w, ["manual"]);
  log(w, "manual", "reset", "重建 T1 待处理；清空人工记录，失败历史保留");
  intents.set(5503, { node: "frontend", reset: false, epoch });
  if (!bridge.reset({ run: w.run, stage: "campus-ready" }))
    openResult("campus-ready", "frontend");
}
function resetCurrent() {
  if (stage.value === "acceptance") {
    resetAcceptance();
    selected.value = null;
    return;
  }
  cancelPending();
  resetGroup(w, stage.value);
  selected.value = null;
  if (["map", "sql", "frontend"].includes(stage.value)) {
    intents.set(5503, { reset: false, epoch });
    bridge.reset({ run: w.run, stage: "template" });
  }
  if (stage.value === "map") {
    intents.set(5500, { reset: false, epoch });
    bridge.reset({ run: w.run, stage: "campus-map" });
  }
}
function resetAll() {
  archivedReports.value.push(exportReport(w));
  epoch++;
  bridge.cancel();
  Object.assign(w, createWorkflow());
  for (const key of Object.keys(pageStates)) delete pageStates[key];
  selected.value = null;
  needsReset.value = false;
  confirmReset.value = false;
  pendingResets.clear();
  intents.clear();
  for (const [p, s] of [
    [5500, "campus-map"],
    [5503, "template"],
  ] as const) {
    const slot = bridge.slots.get(p);
    if (slot && !slot.window.closed) {
      pendingResets.add(p);
      intents.set(p, { reset: true, epoch });
      bridge.reset({ run: w.run, stage: s }, true);
    }
  }
  resetting.value = pendingResets.size > 0;
  focusGroup("map");
  alert.value = resetting.value
    ? "等待已打开页面复位；后勤页需重新点击登录。"
    : "新轮次已准备。刷新前的旧成果标签页请关闭；首次打开将加载新轮次。";
}
function retryReset() {
  for (const p of pendingResets) {
    const s = p === 5500 ? "campus-map" : "template";
    intents.set(p, { reset: true, epoch });
    bridge.open({ run: w.run, stage: s }, true);
  }
}
function jump(group: Group) {
  directTo(w, group);
  selected.value = null;
  focusGroup(group);
  recovery.value = false;
  alert.value = "排练直达：前序材料为预载状态，检查与页面应用未执行。";
}
function key(e: KeyboardEvent) {
  if (e.key === "Escape") {
    selected.value = null;
    recovery.value = false;
    fallback.value = false;
    reportOpen.value = false;
    confirmReset.value = false;
  }
}
let resize: ResizeObserver;
onMounted(() => {
  fit();
  resize = new ResizeObserver(() => {
    if (!drag) fit();
  });
  if (viewport.value) resize.observe(viewport.value);
  window.addEventListener("keydown", key);
});
onBeforeUnmount(() => {
  resize?.disconnect();
  bridge.dispose();
  window.removeEventListener("keydown", key);
});
</script>
<template>
  <div class="workbench">
    <header class="app-header">
      <div class="brand-icon">知</div>
      <div>
        <p class="overline">ZHIXING / WORKFLOW STUDIO</p>
        <h1>校园制作工作台</h1>
      </div>
      <span class="mode-pill" :class="{ rehearsal: w.rehearsal }"
        >{{ w.rehearsal ? "排练模式" : "手动演示" }} · 预制产物 / 真实检查</span
      >
      <div class="header-actions">
        <button @click="reportOpen = true">本轮报告</button
        ><button @click="recovery = !recovery">恢复与直达</button>
      </div>
    </header>
    <div class="subbar">
      <span
        ><b>B1</b> 明理楼 <i>→</i> <b>F4</b> 投影设备 <i>→</i>
        <b>T1</b> 偏色报修</span
      ><span class="version">{{ VERSION }} · {{ w.run }}</span>
    </div>
    <div v-if="needsReset || resetting" class="banner warning" role="alert">
      {{
        needsReset
          ? "工作台已刷新，已生成新轮次。请执行整场复位并关闭旧成果页。"
          : "正在等待成果页复位确认，请在后勤页重新登录。"
      }}<button v-if="needsReset" @click="resetAll">整场复位</button
      ><button v-else @click="retryReset">重试页面复位</button>
    </div>
    <div v-if="alert" class="banner" role="status">
      {{ alert }}<button aria-label="关闭提示" @click="alert = ''">×</button>
    </div>
    <main
      ref="viewport"
      class="canvas"
      aria-label="固定工作流画布"
      @wheel.prevent="
        zoom(
          $event.deltaY < 0 ? 1.08 : 1 / 1.08,
          $event.clientX,
          $event.clientY,
        )
      "
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="pointerUp"
    >
      <div
        class="world"
        :class="{ compact: transform.scale < 0.7 }"
        :style="{
          transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`,
        }"
      >
        <div
          v-for="group in groups"
          :key="group.id"
          class="group"
          :class="group.id"
          :style="{
            left: group.x + 'px',
            top: group.y + 'px',
            width: group.width + 'px',
            height: group.height + 'px',
          }"
        >
          <span>{{ group.step }}</span>
          <h2>{{ group.label }}</h2>
        </div>
        <svg class="edges" width="2430" height="920" aria-hidden="true">
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          <template v-for="node in nodes" :key="node.id">
            <path
              v-for="dep in node.deps"
              :key="dep"
              :d="path(dep, node)"
              :class="{
                done: ['passed', 'produced'].includes(w.statuses[dep]),
              }"
              marker-end="url(#arrow)"
            />
          </template>
        </svg>
        <button
          v-for="node in nodes"
          :key="node.id"
          class="node"
          :class="[displayStatus(node.id), { selected: node.id === selected }]"
          :data-testid="`node-${node.id}`"
          :style="{ left: node.x + 'px', top: node.y + 'px' }"
          @click="showNode(node)"
        >
          <span class="node-heading"
            ><span class="node-dot" /><strong>{{ node.label }}</strong
            ><span class="node-arrow">↗</span></span
          ><small>{{
            transform.scale < 0.7 ? node.caption.split(" · ")[0] : node.caption
          }}</small
          ><span class="node-status">{{
            labelStatus[displayStatus(node.id)]
          }}</span>
        </button>
      </div>
      <div class="canvas-hint">拖动画布平移 · 滚轮缩放 · 点击节点查看详情</div>
    </main>
    <footer class="toolbar">
      <div class="stage-nav">
        <button @click="fit">全图</button
        ><button
          v-for="group in groups"
          :key="group.id"
          :class="{ active: stage === group.id }"
          @click="focusGroup(group.id)"
        >
          {{ group.step }} {{ group.label }}
        </button>
      </div>
      <div class="zoom-tools">
        <button aria-label="缩小画布" @click="zoom(0.85)">−</button
        ><span>{{ Math.round(transform.scale * 100) }}%</span
        ><button aria-label="放大画布" @click="zoom(1.15)">+</button
        ><button class="primary" @click="focusNext">定位下一步 →</button>
      </div>
    </footer>
    <aside v-if="recovery" class="recovery-menu">
      <h2>恢复与排练</h2>
      <p>直达只预载材料，不补造检查通过记录。</p>
      <button v-for="g in groups" :key="g.id" @click="jump(g.id)">
        排练直达 · {{ g.label }}
      </button>
      <hr />
      <button @click="resetCurrent">重置当前阶段</button
      ><button @click="resetAcceptance">重置后勤验收</button
      ><button
        @click="
          confirmReset = true;
          recovery = false;
        "
      >
        整场复位</button
      ><button
        @click="
          fallback = true;
          recovery = false;
          log(w, 'recovery', 'fallback', '切换预制完成态，真实失败保留');
        "
      >
        查看预制完成态
      </button>
    </aside>
    <aside
      v-if="selectedNode"
      class="drawer"
      role="dialog"
      :aria-label="selectedNode.label + '详情'"
    >
      <header class="drawer-header">
        <div>
          <p class="overline">
            {{ groups.find((g) => g.id === selectedNode!.group)?.label }} /
            {{ labelStatus[displayStatus(selectedNode.id)] }}
          </p>
          <h2>{{ selectedNode.label }}</h2>
        </div>
        <button
          class="drawer-close"
          aria-label="关闭节点详情"
          @click="selected = null"
        >
          ×
        </button>
      </header>
      <div class="drawer-content">
        <p class="node-explanation">{{ selectedNode.caption }}</p>
        <div class="material-tabs">
          <button
            v-for="id in selectedNode.materials"
            :key="id"
            :class="{ active: tab === id }"
            @click="
              tab = id;
              full = false;
            "
          >
            {{ id }}
          </button>
        </div>
        <div class="material-title">
          <h3>{{ selectedMaterial?.title }}</h3>
          <span class="badge">{{ selectedMaterial?.kind }}</span>
        </div>
        <img
          v-if="selectedMaterial?.image"
          :src="selectedMaterial.image"
          :alt="selectedMaterial.title"
          class="material-image"
        />
        <div class="code-toolbar">
          <button @click="full = !full">
            {{ full ? "收起完整素材" : "展开完整素材" }}</button
          ><button
            aria-label="减小代码字号"
            @click="fontSize = Math.max(12, fontSize - 1)"
          >
            A−</button
          ><button
            aria-label="增大代码字号"
            @click="fontSize = Math.min(28, fontSize + 1)"
          >
            A＋</button
          ><a
            v-if="selectedMaterial?.download"
            :href="selectedMaterial.download"
            download
            >下载素材</a
          >
        </div>
        <pre :style="{ fontSize: fontSize + 'px' }">{{ visibleText }}</pre>
        <section v-if="selectedNode.id === 'reference'" class="reference-box">
          <h3>当前输入：{{ w.corrected ? "S04 · F4" : "S03 · F404" }}</h3>
          <p>同一张 T1，只替换 facilityId；执行检查才更新状态。</p>
          <div class="button-row">
            <button
              :disabled="!runnable('reference')"
              @click="changeReference(false)"
            >
              载入错误输入 S03</button
            ><button
              :disabled="
                !runnable('reference') || (!w.rejectedOnce && !w.rehearsal)
              "
              @click="changeReference(true)"
            >
              载入修正输入 S04
            </button>
          </div>
          <p
            v-if="w.statuses.reference === 'failed'"
            class="error"
            role="alert"
          >
            {{ validation.errors.join("；") }}
          </p>
        </section>
        <section
          v-if="report && ['test', 'delivery'].includes(selectedNode.id)"
        >
          <h3>
            本轮实际检查 · {{ report.results.filter((r) => r.passed).length }} /
            10
          </h3>
          <div
            v-for="r in report.results"
            :key="r.id"
            class="check-row"
            :class="{ error: !r.passed }"
          >
            <b>{{ r.id }} · {{ r.passed ? "断言通过" : "失败" }}</b
            ><span>{{ r.expected }}</span>
            <p v-if="r.error">{{ r.error }}</p>
          </div>
        </section>
        <section v-if="selectedNode.id === 'manual'" class="manual">
          <p class="notice">
            先在成果页实际操作，再登记。H04/H05 必须在最终领取与完成后填写。
          </p>
          <p>固定处理结果：{{ C01.completionResult }}</p>
          <div class="button-row">
            <button @click="openResult('campus-ready')">查看后勤成果</button
            ><button @click="openResult('campus-map')">查看校园沙盘</button>
          </div>
          <div
            v-for="([id, description], index) in manualDefinitions"
            :key="id"
            class="manual-item"
          >
            <h3>
              {{ id }} ·
              {{
                w.manual[index].status === "pending"
                  ? "待核验"
                  : w.manual[index].status === "passed"
                    ? "通过"
                    : "失败"
              }}
            </h3>
            <p>{{ description }}</p>
            <textarea
              v-model="w.manual[index].evidence"
              :aria-label="id + ' 观察证据'"
              placeholder="填写实际看到的页面和操作结果"
              rows="3"
              @input="
                w.manual[index].status = 'pending';
                w.statuses.manual = 'pending';
                w.statuses.delivery = 'stale';
              "
            />
            <div class="button-row">
              <button
                :disabled="
                  !automatedPassed(w) || !w.manual[index].evidence.trim()
                "
                @click="manualSave(index, 'passed')"
              >
                {{ id }} 登记通过</button
              ><button
                :disabled="
                  !automatedPassed(w) || !w.manual[index].evidence.trim()
                "
                @click="manualSave(index, 'failed')"
              >
                {{ id }} 登记失败
              </button>
            </div>
          </div>
        </section>
        <section v-if="selectedNode.id === 'delivery'" class="delivery">
          <h3>
            {{ deliveryReady(w) ? "本轮满足交付条件" : "本轮尚未满足交付条件" }}
          </h3>
          <p>
            自动检查：{{ automatedPassed(w) ? "通过" : "未通过 / 未执行" }} ·
            人工验收：{{ w.manual.filter((m) => m.status === "passed").length }}
            / 5
          </p>
          <button @click="download(exportReport(w), w.run + '.json')">
            下载本轮 JSON 报告</button
          ><button @click="openResult('campus-map')">回到校园沙盘</button>
        </section>
        <p
          v-if="
            !canExecute(w, selectedNode.id) &&
            w.statuses[selectedNode.id] !== 'running'
          "
          class="notice"
        >
          前置条件：{{
            selectedNode.deps
              .map((id) => nodes.find((n) => n.id === id)?.label)
              .join("、")
          }}。请先完成对应节点。
        </p>
        <p
          v-if="['map', 'template', 'frontend'].includes(selectedNode.id)"
          class="notice"
        >
          {{
            pageStates[
              selectedNode.id === "map"
                ? "campus-map"
                : selectedNode.id === "template"
                  ? "template"
                  : "campus-ready"
            ]?.detail ?? "点击下方动作，打开独立成果标签页。"
          }}
        </p>
        <button
          v-if="
            ['map', 'template', 'frontend'].includes(selectedNode.id) &&
            w.statuses[selectedNode.id] === 'failed'
          "
          @click="
            openResult(
              selectedNode.id === 'map'
                ? 'campus-map'
                : selectedNode.id === 'template'
                  ? 'template'
                  : 'campus-ready',
              selectedNode.id,
              true,
            )
          "
        >
          重新加载成果页
        </button>
      </div>
      <footer class="drawer-footer">
        <span>{{ labelStatus[displayStatus(selectedNode.id)] }}</span
        ><button
          class="primary"
          :disabled="
            !runnable(selectedNode.id) ||
            (selectedNode.id === 'delivery' && !deliveryReady(w))
          "
          @click="execute(selectedNode)"
        >
          {{
            w.statuses[selectedNode.id] === "running"
              ? "等待实际结果…"
              : selectedNode.action
          }}
        </button>
      </footer>
    </aside>
    <div v-if="reportOpen || fallback || confirmReset" class="modal-backdrop">
      <section
        class="modal"
        role="dialog"
        :aria-label="
          confirmReset ? '整场复位确认' : fallback ? '预制完成态' : '本轮报告'
        "
      >
        <button
          class="modal-close"
          aria-label="关闭窗口"
          @click="
            reportOpen = false;
            fallback = false;
            confirmReset = false;
          "
        >
          ×
        </button>
        <template v-if="confirmReset"
          ><h2>开始新一轮演示</h2>
          <p>
            当前报告暂存于本页，已打开成果页将恢复初始状态，后勤需重新登录。未下载的报告在刷新后丢失。
          </p>
          <div class="button-row">
            <button @click="download(exportReport(w), w.run + '.json')">
              先下载当前报告</button
            ><button class="primary" @click="resetAll">确认整场复位</button>
          </div></template
        >
        <template v-else-if="fallback"
          ><span class="badge">预制完成态 · 非本轮验收结果</span>
          <h2>校园交付参考</h2>
          <img
            :src="materials.R01.image"
            alt="预制校园成果图 · 既有模型截图"
            class="fallback-image"
          />
          <div class="completion-card">
            <h3>T1 · 明理楼投影画面偏色</h3>
            <p>预制状态：已完成 · 处理人：后勤人员</p>
            <p>{{ C01.completionResult }}</p>
          </div>
          <p>
            此处用于故障说明，不改变本轮检查、人工记录或失败历史。
          </p></template
        >
        <template v-else
          ><p class="overline">{{ w.run }}</p>
          <h2>本轮检查与验收</h2>
          <div class="report-summary">
            <span
              >自动检查
              <b>{{ automatedPassed(w) ? "通过" : "未通过 / 未执行" }}</b></span
            ><span
              >人工验收
              <b
                >{{ w.manual.filter((m) => m.status === "passed").length }} /
                5</b
              ></span
            >
          </div>
          <p>预制产物、真实函数检查与人工记录分别保存。</p>
          <button
            class="primary"
            @click="download(exportReport(w), w.run + '.json')"
          >
            下载本轮 JSON
          </button>
          <pre>{{ JSON.stringify(exportReport(w), null, 2) }}</pre>
          <h3 v-if="archivedReports.length">本页暂存的历史轮次</h3>
          <button
            v-for="old in archivedReports"
            :key="old.run"
            @click="download(old, old.run + '.json')"
          >
            下载 {{ old.run }}
          </button></template
        >
      </section>
    </div>
  </div>
</template>
