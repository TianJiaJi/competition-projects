<script setup lang="ts">
import {
  computed,
  reactive,
  watch,
  ref,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { LiquidGlassSurface } from "@scene/ui/liquid-glass";
import type {
  WorkflowNode,
  RunState,
  SampleDefinition,
  Stage,
  PreviewContext,
  NodeActionFeedback,
} from "@scene/demo/builder-types";
import PreviewLinks from "./PreviewLinks.vue";
const props = defineProps<{
  node: WorkflowNode;
  state: RunState;
  definition: SampleDefinition;
  busy: boolean;
  feedback?: NodeActionFeedback;
  statuses: Record<string, string>;
}>();
const emit = defineEmits<{
  action: [body: Record<string, unknown>];
  open: [context: PreviewContext, port: number];
}>();
const record = computed(() => props.state.nodes[props.node.id]);
const step = computed(() =>
  props.definition.steps.find((s) => s.id === props.node.stage),
);
const stage = computed(() => props.state.stages[props.node.stage as Stage]);
const automatic = computed(() =>
  ["process", "execution"].includes(props.node.kind),
);
const labels = {
  blocked: "等待上游",
  invalidated: "等待重新交接",
  ready: "等待输入",
  running: "处理中",
  waiting: "等待验收",
  complete: "已完成",
  failed: "执行失败",
};
const draft = reactive({ text: "", observation: "" });
const key = computed(
  () => `assembly.node-draft.${props.state.run}.${props.node.id}`,
);
let loading = false;
watch(
  key,
  () => {
    loading = true;
    let saved: Partial<typeof draft> = {};
    try {
      saved = JSON.parse(localStorage.getItem(key.value) || "{}");
    } catch {}
    draft.text =
      saved.text ??
      record.value.input ??
      (props.node.kind === "requirement"
        ? stage.value?.requirement
        : props.node.kind === "adjustment"
          ? stage.value?.adjustment
          : "") ??
      "";
    draft.observation = saved.observation ?? "";
    loading = false;
  },
  { immediate: true },
);
watch(draft, () => {
  if (!loading) localStorage.setItem(key.value, JSON.stringify(draft));
});
const canEdit = computed(() =>
  props.node.deps.every((id) => props.state.nodes[id]?.status === "complete"),
);
function action(action: string, values: Record<string, unknown> = {}) {
  emit("action", {
    node: props.node.id,
    action,
    revision: props.state.revision,
    ...values,
  });
}
const files = computed(
  () => record.value.files || (record.value.file ? [record.value.file] : []),
);
const fileInput = ref<HTMLInputElement>();
function importFiles(list?: FileList | null) {
  if (!list?.length) return;
  action("import", {
    mode: "append",
    files: Array.from(list).map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
      lastModified: f.lastModified,
    })),
  });
}
function selected(e: Event) {
  const input = e.target as HTMLInputElement;
  importFiles(input.files);
  input.value = "";
}
function pick() {
  fileInput.value?.click();
}
const clock = ref(Date.now());
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  timer = setInterval(() => {
    if (record.value.status === "running") clock.value = Date.now();
  }, 400);
});
onBeforeUnmount(() => clearInterval(timer));
const progress = computed(() =>
  record.value.status === "complete"
    ? 1
    : record.value.status === "running" && record.value.durationMs
      ? Math.min(
          0.99,
          Math.max(
            0,
            (clock.value - Date.parse(record.value.startedAt!)) /
              record.value.durationMs,
          ),
        )
      : 0,
);
const phases = computed(() =>
  ["running", "complete"].includes(record.value.status)
    ? (props.node.phases || []).slice(
        0,
        record.value.status === "complete"
          ? undefined
          : 1 + Math.floor(progress.value * (props.node.phases?.length || 0)),
      )
    : [],
);
const artifacts = computed(() =>
  props.node.artifact === undefined
    ? step.value?.artifacts || []
    : step.value?.artifacts.filter((_, i) => i === props.node.artifact) || [],
);
const currentSummary = computed(() =>
  record.value.status === "running"
    ? phases.value.at(-1) || "等待执行结果返回"
    : record.value.status === "waiting"
      ? "成果已就绪，请填写观察并验收"
      : record.value.status === "complete"
        ? "处理完成"
        : props.node.task || props.node.summary,
);
</script>
<template>
  <LiquidGlassSurface
    as="article"
    :radius="13"
    :blur="2"
    :tint-opacity="0.86"
    :data-testid="'node-' + node.id"
    :data-node-id="node.id"
    :data-status="record.status"
    :class="[
      'flow-node',
      'kind-' + node.kind,
      'status-' + record.status,
      { automatic, 'submission-failed': feedback?.status === 'failed' },
    ]"
    :style="{ '--role': `var(--role-${node.stage})` }"
  >
    <header class="node-header">
      <span class="node-icon">{{
        node.kind === "source"
          ? "↥"
          : node.kind === "acceptance"
            ? "✓"
            : automatic
              ? "✧"
              : node.kind === "placeholder"
                ? "⋯"
                : "✎"
      }}</span>
      <div>
        <small>{{
          automatic
            ? "处理节点"
            : node.stage === "04"
              ? "测试与交付负责人"
              : step?.owner
        }}</small>
        <h2>{{ node.title }}</h2>
      </div>
    </header>
    <div class="node-body">
      <div class="node-state" role="status">
        <span class="state-dot"></span
        >{{
          node.kind === "placeholder"
            ? "待定义"
            : automatic && record.status === "ready"
              ? "等待处理"
              : labels[record.status]
        }}<span v-if="feedback" class="submit-state">{{
          feedback.status === "queued"
            ? "排队中"
            : feedback.status === "pending"
              ? "提交中…"
              : "提交失败"
        }}</span>
      </div>
      <div class="node-summaries">
        <p class="input-summary">
          <b>输入</b
          ><span>{{
            node.kind === "source"
              ? files.length
                ? `${files.length} 份素材`
                : "待导入素材"
              : record.input || `${node.deps.length} 项上游产物`
          }}</span>
        </p>
        <p class="node-description">
          <b>处理</b><span>{{ currentSummary }}</span>
        </p>
        <p class="node-output">
          <b>输出</b
          ><span>{{
            record.status === "complete"
              ? record.output
              : record.status === "waiting"
                ? node.outputName
                : "—"
          }}</span>
        </p>
      </div>
      <template v-if="node.kind === 'source'">
        <input
          ref="fileInput"
          type="file"
          multiple
          class="file-picker"
          :aria-label="'导入' + node.title"
          @change="selected"
        />
        <div
          class="drop-input"
          role="button"
          tabindex="0"
          :aria-label="'选择文件：' + node.title"
          @click="pick"
          @keydown.enter.prevent="pick"
          @keydown.space.prevent="pick"
          @dragover.prevent
          @drop.prevent="importFiles($event.dataTransfer?.files)"
        >
          <strong>选择文件或拖入素材</strong
          ><small>{{
            feedback?.status === "pending"
              ? "正在登记…"
              : feedback?.status === "failed"
                ? "导入未完成"
                : files.length
                  ? "已登记，可继续添加"
                  : "支持多选"
          }}</small>
        </div>
        <div class="file-list node-scroll" data-scroll-area>
          <div v-for="f in files" :key="f.id || f.name" class="file-row">
            <span :title="f.name">{{ f.name }}</span
            ><button
              :aria-label="'移除 ' + f.name"
              @click="action('import', { mode: 'remove', fileId: f.id })"
            >
              ×
            </button>
          </div>
          <p v-if="!files.length" class="muted">尚未登记文件</p>
        </div>
      </template>
      <template
        v-else-if="node.kind === 'requirement' || node.kind === 'adjustment'"
      >
        <div class="node-scroll editor-scroll" data-scroll-area>
          <details
            v-if="node.kind === 'adjustment'"
            class="artifact draft-summary"
          >
            <summary>查看初稿</summary>
            <p>{{ step?.draft }}</p>
          </details>
          <div class="row">
            <label :for="node.id + '-input'">{{
              node.kind === "requirement" ? "需求描述" : "修改说明"
            }}</label
            ><button
              class="text-button"
              @click="
                draft.text =
                  (node.kind === 'requirement'
                    ? step?.prompt
                    : step?.adjustment) || ''
              "
            >
              填入参考描述
            </button>
          </div>
          <textarea
            :id="node.id + '-input'"
            v-model="draft.text"
            rows="3"
            maxlength="10000"
            :placeholder="
              node.kind === 'requirement' ? step?.prompt : step?.adjustment
            "
          />
          <details
            v-if="node.kind === 'adjustment' && record.submitted"
            class="adjustment-review"
            :open="record.status !== 'complete'"
          >
            <summary>
              {{
                record.status === "complete"
                  ? "查看已确认方案与差异"
                  : "审阅调整与差异"
              }}
            </summary>
            <div class="difference">
              <b>调整后</b>
              <p>{{ step?.revised }}</p>
            </div>
            <details v-for="a in artifacts" :key="a.title" class="artifact">
              <summary>{{ a.title }} · 查看差异</summary>
              <b>调整前</b>
              <pre>{{ a.before }}</pre>
              <b>调整后</b>
              <pre>{{ a.after }}</pre>
            </details>
          </details>
          <p v-if="!canEdit" class="muted">等待上游交接</p>
          <p
            v-else-if="record.submitted && draft.text !== record.input"
            class="muted"
          >
            修改后请重新提交调整
          </p>
        </div>
      </template>
      <template v-else-if="node.kind === 'acceptance'">
        <PreviewLinks
          :state="state"
          :definition="definition"
          :stage="node.stage as Stage"
          :statuses="statuses"
          @open="(c, p) => emit('open', c, p)"
        />
        <label :for="node.id + '-observation'">验收观察</label
        ><textarea
          :id="node.id + '-observation'"
          v-model="draft.observation"
          rows="2"
          maxlength="10000"
          placeholder="记录观察、交互结果或需要调整的地方"
        />
        <p
          v-if="stage?.acceptance"
          class="evidence node-scroll"
          data-scroll-area
        >
          {{ stage.acceptance.passed ? "通过" : "退回" }} ·
          {{ stage.acceptance.detail }} ·
          {{ new Date(stage.acceptance.at).toLocaleString() }}
        </p>
      </template>
      <template v-else-if="automatic">
        <div class="node-scroll process-scroll" data-scroll-area>
          <div
            class="progress-track"
            v-if="record.status === 'running' && node.phases?.length"
            role="progressbar"
            aria-label="处理进度"
            :aria-valuenow="Math.floor(progress * 100)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <i :style="{ width: progress * 100 + '%' }"></i>
          </div>
          <details v-if="phases.length" class="processing-history">
            <summary>
              处理过程 · {{ phases.length }} / {{ node.phases?.length }}
            </summary>
            <p v-for="phase in phases" :key="phase">{{ phase }}</p>
          </details>
          <details v-if="record.output" class="processing-history">
            <summary>输出详情</summary>
            <p>{{ record.output }}</p>
          </details>
          <details
            v-if="
              record.status === 'complete' &&
              (node.artifact !== undefined || node.showArtifacts)
            "
            class="artifact"
          >
            <summary>查看完整产物</summary>
            <section v-for="a in artifacts" :key="a.title">
              <b>{{ a.title }}</b>
              <pre>{{ a.after }}</pre>
              <a
                v-for="asset in a.assets"
                :key="asset.url"
                :href="asset.url"
                target="_blank"
                >{{ asset.label }}</a
              >
            </section>
          </details>
        </div>
      </template>
      <div
        v-if="record.error || feedback?.status === 'failed'"
        class="node-error node-scroll"
        role="alert"
        data-scroll-area
      >
        {{ feedback?.error || record.error }}
      </div>
    </div>
    <div class="node-actions">
      <button
        v-if="feedback?.status === 'failed'"
        @click="emit('action', feedback.body)"
      >
        重试提交
      </button>
      <template v-else-if="node.kind === 'source'"
        ><button @click="action('import', { mode: 'reference' })">
          载入参考素材
        </button></template
      >
      <template
        v-else-if="node.kind === 'requirement' || node.kind === 'adjustment'"
      >
        <button
          class="primary"
          :disabled="busy || !canEdit || !draft.text.trim()"
          @click="action('submit', { text: draft.text })"
        >
          {{ node.kind === "requirement" ? "提交需求" : "提交调整" }}
        </button>
        <button
          v-if="node.kind === 'adjustment'"
          class="primary"
          :disabled="
            busy ||
            !canEdit ||
            !record.submitted ||
            record.status === 'complete' ||
            draft.text !== record.input
          "
          @click="action('confirm')"
        >
          {{ record.status === "complete" ? "方案已确认" : "确认组装" }}
        </button>
      </template>
      <template v-else-if="node.kind === 'acceptance'"
        ><button
          class="accept-button"
          :disabled="
            busy || record.status !== 'waiting' || !draft.observation.trim()
          "
          @click="action('accept', { passed: true, detail: draft.observation })"
        >
          验收通过</button
        ><button
          :disabled="
            busy || record.status !== 'waiting' || !draft.observation.trim()
          "
          @click="
            action('accept', { passed: false, detail: draft.observation })
          "
        >
          退回调整
        </button></template
      >
      <button
        v-else-if="record.status === 'failed'"
        :disabled="busy"
        @click="action('retry')"
      >
        重试此节点
      </button>
    </div>
    <footer class="node-footer">
      {{
        record.completedAt
          ? `${new Date(record.completedAt).toLocaleTimeString()} · ${node.kind === "acceptance" ? "交接已记录" : "结果已保存"}`
          : " "
      }}
    </footer>
  </LiquidGlassSurface>
</template>
