<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { PreviewWindows, request } from "@scene/demo/builder";
import type {
  PreviewContext,
  RunState,
  SampleDefinition,
  Stage,
  NodeActionFeedback,
} from "@scene/demo/builder-types";
import { LiquidGlassSurface } from "@scene/ui/liquid-glass";
import WorkflowCanvas from "./WorkflowCanvas.vue";
import PreviewLinks from "./PreviewLinks.vue";
const definition = ref<SampleDefinition>(),
  state = ref<RunState>();
const busy = ref(false),
  error = ref(""),
  connectionError = ref(""),
  notice = ref("");
const feedback = reactive<Record<string, NodeActionFeedback>>({});
const queue: { run: string; node: string; item: NodeActionFeedback }[] = [];
const submissionHistory = ref<
  {
    at: string;
    node: string;
    status: string;
    body: Record<string, unknown>;
    error?: string;
  }[]
>([]);
function recordSubmission(
  node: string,
  item: NodeActionFeedback,
  status: string,
) {
  submissionHistory.value.push({
    at: new Date().toISOString(),
    node,
    status,
    body: { ...item.body },
    ...(item.error ? { error: item.error } : {}),
  });
}
watch(
  submissionHistory,
  () => {
    if (state.value)
      try {
        localStorage.setItem(
          `assembly.submissions.${state.value.run}`,
          JSON.stringify(submissionHistory.value),
        );
      } catch {}
  },
  { deep: true },
);
let mutationEpoch = 0;
let definitionSignature = "";
const panel = ref<"results" | "report" | null>(null);
const canvas = ref<InstanceType<typeof WorkflowCanvas>>();
const statuses = reactive<Record<string, string>>({});
const bridge = new PreviewWindows((id, text) => (statuses[id] = text));
const manual = reactive<Record<string, { detail: string; passed: boolean }>>(
  {},
);
const previewsStage = ref<Stage>("01");
const checks = computed(() => [
  ...new Map(
    state.value?.checks
      .filter((c) => c.revision === state.value?.revision)
      .map((c) => [c.id, c]),
  ).values(),
]);
const observations = computed(
  () =>
    new Map(
      state.value?.manual
        .filter((c) => c.revision === state.value?.revision)
        .map((c) => [c.id, c]),
    ),
);
let polling: ReturnType<typeof setInterval>,
  fetching = false;
function apply(next: RunState) {
  if (
    state.value?.run === next.run &&
    (next.sequence || 0) < (state.value.sequence || 0)
  )
    return;
  const newIdentity = state.value?.run !== next.run;
  if (state.value && newIdentity) {
    Object.keys(statuses).forEach((k) => delete statuses[k]);
    Object.keys(feedback).forEach((k) => delete feedback[k]);
  }
  state.value = next;
  if (newIdentity) {
    submissionHistory.value = [];
    try {
      submissionHistory.value = JSON.parse(
        localStorage.getItem(`assembly.submissions.${next.run}`) || "[]",
      );
      const previous = JSON.parse(
        localStorage.getItem(`assembly.feedback.${next.run}`) || "{}",
      );
      for (const [id, value] of Object.entries(previous) as [
        string,
        NodeActionFeedback,
      ][]) {
        if (next.nodes[id] && value.body)
          feedback[id] = {
            ...value,
            status: "failed",
            error: value.error || "上次提交未收到确认，请重试",
          };
      }
    } catch {}
  }
}
watch(feedback, () => {
  if (state.value)
    try {
      localStorage.setItem(
        `assembly.feedback.${state.value.run}`,
        JSON.stringify(feedback),
      );
    } catch {}
});
async function refresh() {
  if (fetching || busy.value) return;
  fetching = true;
  const epoch = mutationEpoch;
  try {
    const result = await request<{
      definition: SampleDefinition;
      state: RunState;
    }>("/api/workbench");
    if (epoch !== mutationEpoch) return;
    const signature = JSON.stringify(result.definition);
    if (signature !== definitionSignature) {
      definition.value = result.definition;
      definitionSignature = signature;
    }
    apply(result.state);
    for (const m of result.definition.manual)
      manual[m.id] ??= { detail: "", passed: true };
    connectionError.value = "";
  } catch (e) {
    if (epoch === mutationEpoch) connectionError.value = (e as Error).message;
  } finally {
    fetching = false;
  }
}
async function run(work: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  mutationEpoch++;
  error.value = "";
  try {
    await work();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
    void drain();
  }
}
function action(body: Record<string, unknown>) {
  if (!state.value) return;
  const node = String(body.node);
  const item: NodeActionFeedback = {
    status: "queued",
    fileName:
      (body.files as { name: string }[] | undefined)
        ?.map((f) => f.name)
        .join("、") || (body.file as { name?: string })?.name,
    body: { ...body },
  };
  feedback[node] = item;
  queue.push({ run: state.value.run, node, item: feedback[node] });
  void drain();
}
async function drain() {
  if (busy.value || !queue.length) return;
  busy.value = true;
  mutationEpoch++;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      if (state.value?.run !== job.run) continue;
      job.item.status = "pending";
      try {
        const next = await request<RunState>(
          `/api/runs/${job.run}/node`,
          "POST",
          { ...job.item.body, revision: state.value.revision },
        );
        apply(next);
        connectionError.value = "";
        recordSubmission(job.node, job.item, "succeeded");
        if (feedback[job.node] === job.item) delete feedback[job.node];
      } catch (e) {
        job.item.status = "failed";
        job.item.error = (e as Error).message;
        recordSubmission(job.node, job.item, "failed");
        // Keep the failed operation visible while refreshing the revision for an explicit retry.
        try {
          const latest = await request<{ state: RunState }>("/api/workbench");
          apply(latest.state);
        } catch {
          /* The card retains the original error. */
        }
      }
    }
  } finally {
    busy.value = false;
  }
}
function open(context: PreviewContext, port: number) {
  bridge.open(context, port);
}
function newRun() {
  void run(async () => {
    apply(await request("/api/new", "POST", { run: state.value!.run }));
    panel.value = null;
    previewsStage.value = "01";
    Object.keys(manual).forEach(
      (k) => (manual[k] = { detail: "", passed: true }),
    );
    notice.value = "新流程已开始。";
  });
}
function results() {
  previewsStage.value = state.value?.latest || "01";
  panel.value = "results";
}
function verify() {
  void run(async () => {
    apply(await request(`/api/runs/${state.value!.run}/checks`, "POST", {}));
  });
}
function observe(id: string) {
  void run(async () => {
    apply(
      await request(`/api/runs/${state.value!.run}/manual`, "POST", {
        id,
        ...manual[id],
      }),
    );
  });
}
function download() {
  void run(async () => {
    const report = {
      ...(await request<Record<string, unknown>>(
        `/api/runs/${state.value!.run}/report`,
      )),
      clientSubmissionHistory: submissionHistory.value,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `assembly-${state.value!.run}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
function historyLabel(kind: string) {
  return (
    (
      {
        "node-started": "节点开始",
        "node-completed": "节点完成",
        "node-failed": "节点失败",
        "node-retry": "节点重试",
        acceptance: "人工验收",
        invalidated: "交接失效",
        material: "素材导入",
        requirement: "需求记录",
        adjustment: "调整记录",
        confirmed: "方案确认",
        assembled: "成果生成",
        database: "数据库操作",
        failure: "操作失败",
        checks: "检查记录",
        "workflow-migration": "记录恢复",
      } as Record<string, string>
    )[kind] || "流程记录"
  );
}
function historyDetail(item: RunState["history"][number]) {
  try {
    const value = JSON.parse(item.detail);
    return value.node
      ? `${definition.value?.workflow.find((n) => n.id === value.node)?.title || value.node} · ${value.error || value.output || value.input || value.files?.map((f: { name: string }) => f.name).join("、") || value.file?.name || ""}`
      : value.detail || "";
  } catch {
    return (
      definition.value?.workflow.find((n) => n.id === item.detail)?.title ||
      item.detail
    );
  }
}
function key(e: KeyboardEvent) {
  if (e.key === "Escape") panel.value = null;
}
onMounted(() => {
  void refresh();
  polling = setInterval(refresh, 450);
  window.addEventListener("keydown", key);
});
onBeforeUnmount(() => {
  clearInterval(polling);
  bridge.dispose();
  window.removeEventListener("keydown", key);
});
</script>
<template>
  <div class="workbench">
    <LiquidGlassSurface
      as="header"
      class="app-header"
      :radius="0"
      :tint-opacity="0.8"
    >
      <div class="brand-icon">◫</div>
      <div>
        <h1>应用搭建工作台</h1>
      </div>
      <div class="header-actions">
        <a
          class="button-link"
          href="http://localhost:5507/api/assets/material-pack.zip"
          download
          >下载素材</a
        >
        <button :disabled="!state" @click="results">最新成果</button
        ><button :disabled="!state" @click="panel = 'report'">本轮报告</button
        ><button :disabled="busy || !state" @click="newRun">开始新流程</button>
      </div>
    </LiquidGlassSurface>
    <div v-if="error || connectionError" class="banner warning" role="alert">
      {{ error || connectionError }}<button @click="refresh">重新连接</button>
    </div>
    <div v-if="notice" class="banner" role="status">
      {{ notice }}<button aria-label="关闭提示" @click="notice = ''">×</button>
    </div>
    <WorkflowCanvas
      v-if="state && definition"
      ref="canvas"
      :state="state"
      :definition="definition"
      :busy="busy"
      :statuses="statuses"
      :feedback="feedback"
      @action="action"
      @open="open"
    />
    <div v-else class="loading">正在连接工作台服务…</div>
    <div
      v-if="panel && state && definition"
      class="utility-overlay"
      @click.self="panel = null"
    >
      <section
        class="utility-panel"
        role="dialog"
        aria-modal="true"
        :aria-label="panel === 'results' ? '成果链接' : '本轮报告'"
      >
        <header class="utility-header">
          <h2>{{ panel === "results" ? "成果链接" : "本轮报告" }}</h2>
          <button aria-label="关闭面板" @click="panel = null">×</button>
        </header>
        <div class="utility-content">
          <template v-if="panel === 'results'"
            ><div class="tabs">
              <button
                v-for="s in definition.steps"
                :key="s.id"
                :class="{ selected: previewsStage === s.id }"
                @click="previewsStage = s.id"
              >
                {{ s.id }} {{ s.title }}
              </button>
            </div>
            <PreviewLinks
              :state="state"
              :definition="definition"
              :stage="previewsStage"
              :statuses="statuses"
              @open="open"
          /></template>
          <template v-else>
            <section class="summary">
              <p>
                {{ definition.name }} · {{ state.version }} · {{ state.run }}
              </p>
              <p>
                自动检查：<strong>{{
                  checks.length === 10 && checks.every((c) => c.passed)
                    ? "全部通过"
                    : checks.length
                      ? `${checks.filter((c) => c.passed).length} / ${checks.length} 通过`
                      : "尚未执行"
                }}</strong>
              </p>
              <p>
                人工核验：<strong
                  >{{ observations.size }} /
                  {{ definition.manual.length }} 已登记</strong
                >
              </p>
              <div class="row">
                <button
                  :disabled="busy || state.stages['03'].status !== 'assembled'"
                  @click="verify"
                >
                  在独立副本执行检查</button
                ><button :disabled="busy" @click="download">
                  导出本轮记录
                </button>
              </div>
              <div
                v-for="c in checks"
                :key="c.id"
                class="check-row"
                :class="{ error: !c.passed }"
              >
                <strong>{{ c.id }} · {{ c.passed ? "通过" : "失败" }}</strong>
                <p>{{ c.detail }}</p>
              </div>
            </section>
            <section class="observations">
              <h3>人工观察</h3>
              <form
                v-for="m in definition.manual"
                :key="m.id"
                @submit.prevent="observe(m.id)"
              >
                <label :for="m.id">{{ m.id }} · {{ m.title }}</label
                ><textarea
                  :id="m.id"
                  v-model="manual[m.id].detail"
                  rows="2"
                  placeholder="填写观察说明"
                />
                <div class="row">
                  <select
                    v-model="manual[m.id].passed"
                    :aria-label="m.id + ' 核验结果'"
                  >
                    <option :value="true">通过</option>
                    <option :value="false">失败</option></select
                  ><button :disabled="busy || !manual[m.id].detail.trim()">
                    登记观察
                  </button>
                </div>
                <p v-if="observations.has(m.id)">
                  {{ observations.get(m.id)?.passed ? "通过" : "失败" }} ·
                  {{ observations.get(m.id)?.detail }}
                </p>
              </form>
            </section>
            <section class="history">
              <h3>流程与失败历史</h3>
              <details
                v-for="(item, i) in submissionHistory
                  .filter((h) => h.status === 'failed')
                  .slice()
                  .reverse()"
                :key="'client-' + i"
              >
                <summary>
                  {{ new Date(item.at).toLocaleTimeString() }} · 提交失败 ·
                  {{
                    definition.workflow.find((n) => n.id === item.node)?.title
                  }}
                </summary>
                <p>{{ item.error }}</p>
              </details>
              <p v-if="!state.history.length">尚无记录</p>
              <details v-for="(h, i) in [...state.history].reverse()" :key="i">
                <summary>
                  {{ new Date(h.at).toLocaleTimeString() }} ·
                  {{ historyLabel(h.kind) }} {{ h.stage || "" }}
                </summary>
                <p>{{ historyDetail(h) }}</p>
              </details>
            </section>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>
