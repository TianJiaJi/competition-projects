<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  Cpu,
  FileText,
  Gauge,
  LayoutDashboard,
  Play,
  Plus,
  Server,
  Settings2,
  ShieldCheck,
  Square,
  X,
  Zap,
} from "lucide-vue-next";
import TrendChart from "./TrendChart.vue";
import SystemManager from "./SystemManager.vue";
import ModalFrame from "./ModalFrame.vue";
import LoadReport from "./LoadReport.vue";
import SpecialWorkspace from "./SpecialWorkspace.vue";
import SpecialReportView from "./SpecialReport.vue";
import { SpecialSession, createSpecialReport, specialSummary, type ScenarioId, type ScenarioRuns, type SpecialReport } from "./special-engine";
import { specialReportHtml } from "./special-report";
import { loadReportHtml } from "./report-export";
import {
  cloneSystem,
  loadSystems,
  persistSystems,
  resolveEndpoints,
  validateSystem,
} from "./systems";
import {
  delay,
  simulatedSample,
  modelSample,
  normalizeConfig,
  phaseName,
  reportDocument,
  retainReports,
  startLoadSession,
  summarize,
  type Endpoint,
  type Frame,
  type LoadConfig,
  type LoadResult,
  type LoadSession,
  type Report,
  type MeasurementReport,
  type Sample,
  type SystemConfig,
} from "./engine";

// Keep simulated checks readable without adding presentation time to modeled latency.
const API_LOADING_PROGRESS_MIN_MS = 3400;
const API_LOADING_COMPLETE_MS = 400;
const latencyDisplayTick = ref(0);
let latencyDisplayTimer: number | undefined;
onMounted(() => {
  latencyDisplayTimer = window.setInterval(() => {
    if (!document.hidden) {
      latencyDisplayTick.value++;
      if (!pressureMetrics.value) captureSuiteTrend();
    }
  }, 900);
});

// Bounded presentation movement around each sample, without changing its evidence.
function presentationLatency(value: number, span: number, key: string) {
  if (value <= 0 || latencyDisplayTick.value === 0) return value;
  const phase = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return Math.max(
    0,
    value + Math.sin(latencyDisplayTick.value * 1.31 + phase) * span / 2,
  );
}

const loaded = loadSystems({ getItem: (key) => localStorage.getItem(key) });
const systemStore = ref(loaded.store);
const activeSystem = computed(
  () =>
    systemStore.value.systems.find((s) => s.id === systemStore.value.activeId)!,
);
const endpoints = computed(() => resolveEndpoints(activeSystem.value));
const tabs = [
  { id: "overview", label: "测试总览", icon: LayoutDashboard },
  { id: "api", label: "API 验证", icon: Code2 },
  { id: "load", label: "压力测试", icon: Gauge },
  { id: "special", label: "专项验证", icon: ShieldCheck },
  { id: "reports", label: "测试记录", icon: FileText },
] as const;
const tab = ref<(typeof tabs)[number]["id"]>("overview");
const busy = ref<"suite" | "load" | "special" | null>(null),
  stopping = ref(false);
const notice = ref(
  loaded.recovered ? "已恢复默认系统配置，可在“管理系统”中重新配置。" :
    [loaded.upgraded ? "默认 API 验收目录已升级为 110 项用例。" : "",
      loaded.campusUpgraded ? "智慧校园 API 验收目录已升级为 110 项用例。" : ""].filter(Boolean).join(" "),
);
const managerOpen = ref(false),
  detailId = ref<string | null>(null);
const search = ref(""),
  filter = ref("all");
const groupFilter = ref("all");
const endpointGroups = computed(() => [...new Set(endpoints.value.map(endpoint => endpoint.group))]);
const results = shallowRef<Record<string, Sample>>({});
const apiLatencyOffsets = shallowRef<Record<string, number>>({});
const suiteSamples = shallowRef<Sample[]>([]),
  suiteFrames = shallowRef<Frame[]>([]);
const suiteElapsed = ref(0),
  suiteDone = ref(0),
  suiteTotal = ref(0),
  suiteHasRun = ref(false);
const suitePresentationProgress = ref(0);
const suitePresentedDone = computed(() =>
  Math.min(
    suiteDone.value,
    Math.floor((suitePresentationProgress.value * suiteTotal.value) / 100 + 1e-6),
  ),
);
const loadState = shallowRef<LoadResult | null>(null);
const reports = shallowRef<Report[]>([]);
const specialBusyId = ref<ScenarioId | null>(null);
const specialRuns = shallowRef<ScenarioRuns>({} as ScenarioRuns);
let specialSession: SpecialSession;
function resetSpecial() {
  specialSession?.dispose();
  specialBusyId.value = null;
  if (busy.value === "special") busy.value = null;
  specialSession = new SpecialSession((runs, busyId) => {
    specialRuns.value = runs;
    specialBusyId.value = busyId;
  });
  specialRuns.value = specialSession.snapshot();
}
async function advanceSpecial(id: ScenarioId, step: number) {
  if (busy.value) return;
  const session = specialSession;
  busy.value = "special";
  try { await session.advance(id, step); }
  catch (error) { notice.value = `本轮操作已暂停：${error instanceof Error ? error.message : "请重新运行"}`; }
  finally { if (session === specialSession) busy.value = null; }
}
function resetScenario(id: ScenarioId, parameter?: string) {
  if (!busy.value) specialSession.reset(id, parameter);
}
function saveSpecialReport() {
  if (busy.value) return;
  const report = createSpecialReport(activeSystem.value, specialRuns.value);
  saveReport(report);
  reportId.value = report.id;
}
const reportId = ref<string | null>(null);
const selectedSpecialReport = computed(() => reports.value.find((report): report is SpecialReport => report.id === reportId.value && report.kind === "special"));
const selectedLoadReport = computed(() => reports.value.find((report): report is MeasurementReport => report.id === reportId.value && report.kind === "load"));
const config = ref<LoadConfig>({
  concurrency: 1000,
  duration: 60,
  rps: 0,
  endpointId: "snapshot",
});
const runningConfig = shallowRef<LoadConfig>({ ...config.value });
let controller: AbortController | undefined,
  loadSession: LoadSession | undefined,
  disposed = false;
const lastActivity = ref<"suite" | "load">("suite");
const suiteStats = computed(() =>
  summarize(suiteSamples.value, suiteElapsed.value),
);
const suiteCardLatency = computed(() => {
  const display = (value: number) =>
    Math.round(presentationLatency(value, 4, "suite") * 10) / 10;
  return {
    p50: display(suiteStats.value.p50),
    p95: display(suiteStats.value.p95),
    p99: display(suiteStats.value.p99),
  };
});
const suiteTrendHistory = shallowRef<Frame[]>([]);
const suiteTrendFrames = computed(() => {
  const start = suiteTrendHistory.value[0]?.second || 0;
  return suiteTrendHistory.value.map((frame) => ({
    ...frame,
    second: frame.second - start,
  }));
});
const suiteTrendDuration = computed(() =>
  Math.max(0.9, suiteTrendFrames.value.at(-1)?.second || 0),
);
function captureSuiteTrend() {
  if (!suiteStats.value.count) return;
  const previous = suiteTrendHistory.value.at(-1);
  const frame: Frame = {
    second: previous ? Math.round((previous.second + 0.9) * 10) / 10 : 0,
    ...suiteCardLatency.value,
    rps: 0,
    concurrency: 0,
    targetRps: 0,
    level: 0,
    phase: "warmup",
    failed: suiteStats.value.failed,
  };
  // Keep a rolling display history separate from the report's request frames.
  suiteTrendHistory.value = [...suiteTrendHistory.value.slice(-59), frame];
}
const loadStats = computed(() =>
  summarize(loadState.value?.samples || [], loadState.value?.elapsedMs || 0),
);
const pressureMetrics = computed(
  () =>
    tab.value === "load" ||
    (lastActivity.value === "load" && tab.value === "overview"),
);
const lastFrame = computed(() => loadState.value?.frames.at(-1));
const visibleEndpoints = computed(() =>
  endpoints.value.filter(
    (e) =>
      (!search.value ||
        `${e.name} ${e.path}`
          .toLowerCase()
          .includes(search.value.toLowerCase())) &&
      (filter.value === "all" || results.value[e.id]?.outcome === filter.value) &&
      (groupFilter.value === "all" || e.group === groupFilter.value),
  ),
);
const visibleReports = computed(() =>
  reports.value.filter((report) => report.system.id === activeSystem.value.id),
);
const latest = computed(() => visibleReports.value[0]);
const latestLoadReport = computed(() => visibleReports.value.find(report => report.kind === "load"));
const selected = computed(() =>
  endpoints.value.find((e) => e.id === detailId.value),
);
const selectedResult = computed(() =>
  detailId.value ? results.value[detailId.value] : undefined,
);
const loadEndpoint = computed(
  () =>
    endpoints.value.find(
      (e) =>
        e.id ===
        (loadState.value
          ? runningConfig.value.endpointId
          : config.value.endpointId),
    ) || endpoints.value[0],
);
const chartConfig = computed(() =>
  loadState.value ? runningConfig.value : config.value,
);
const progress = computed(() =>
  busy.value === "suite"
    ? suitePresentationProgress.value
    : Math.min(
        100,
        ((loadState.value?.elapsedMs || 0) /
          (runningConfig.value.duration * 1000)) *
          100,
      ),
);
const canIncrease = computed(
  () =>
    busy.value === "load" &&
    !stopping.value &&
    (loadState.value?.level || 0) < 5,
);
const number = (value: number, digits = 0) =>
  value.toLocaleString("zh-CN", { maximumFractionDigits: digits });
const time = (value: string) =>
  new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
const resultName = (sample?: Sample) =>
  !sample
    ? "待测试"
    : sample.outcome === "passed"
      ? "通过"
      : sample.outcome === "cancelled"
        ? "已取消"
        : "未通过";
const recentEvents = computed(() =>
  [...(loadState.value?.events || [])].reverse().slice(0, 4),
);

function saveStorage() {
  if (
    !persistSystems(
      { setItem: (key, value) => localStorage.setItem(key, value) },
      systemStore.value,
    )
  )
    notice.value =
      "浏览器未能保存配置，本次会话仍可使用。请检查浏览器存储设置。";
}
function resetView() {
  resetSpecial();
  latencyDisplayTick.value = 0;
  apiLatencyOffsets.value = {};
  results.value = Object.fromEntries(
    endpoints.value.map((endpoint) => [
      endpoint.id,
      modelSample(endpoint, 0, 0, 0, 20, "baseline"),
    ]),
  );
  suiteSamples.value = Object.values(results.value);
  suiteFrames.value = [];
  suiteTrendHistory.value = [];
  captureSuiteTrend();
  suiteElapsed.value = 0;
  suiteHasRun.value = false;
  loadState.value = null;
  lastActivity.value = "suite";
  detailId.value = null;
  search.value = "";
  filter.value = "all";
  groupFilter.value = "all";
  reportId.value = null;
  config.value = {
    ...config.value,
    endpointId:
      endpoints.value.find((e) => e.id === "snapshot")?.id ||
      endpoints.value[0].id,
  };
  runningConfig.value = { ...config.value };
}
resetView();
if (loaded.recovered || loaded.catalogUpdated || loaded.servicesUpdated) saveStorage();
function switchSystem(event: Event) {
  if (busy.value) return;
  const id = (event.target as HTMLSelectElement).value;
  if (!systemStore.value.systems.some((s) => s.id === id)) return;
  systemStore.value.activeId = id;
  resetView();
  notice.value = "";
  saveStorage();
}
function saveSystems(systems: SystemConfig[], activeId: string) {
  if (busy.value) return;
  systemStore.value = { ...systemStore.value, version: 1, activeId, systems };
  managerOpen.value = false;
  resetView();
  notice.value = "系统配置已保存。";
  saveStorage();
}
function registerSystems(systems: SystemConfig[]) {
  if (busy.value) return;
  const additions = systems.filter(system => !validateSystem(system).length && !systemStore.value.systems.some(current => current.id === system.id));
  systemStore.value.systems.push(...additions.slice(0, 20 - systemStore.value.systems.length).map(cloneSystem));
  if (additions.length) { notice.value = `服务发现已接入 ${additions.length} 个新平台，可选择系统开始测试。`; saveStorage(); }
}
function stop() {
  stopping.value = true;
  controller?.abort();
}
function increase() {
  loadSession?.increase();
}
function saveReport(report: Report) {
  reports.value = retainReports(reports.value, report);
}
async function runSuite(onlyId?: string) {
  if (busy.value) return;
  const system = cloneSystem(activeSystem.value),
    targets = resolveEndpoints(system).filter(
      (e) => !onlyId || e.id === onlyId,
    );
  if (!targets.length) return;
  detailId.value = null;
  busy.value = "suite";
  stopping.value = false;
  controller = new AbortController();
  lastActivity.value = "suite";
  const signal = controller.signal,
    startedAt = new Date().toISOString(),
    start = performance.now();
  suiteSamples.value = [];
  suiteFrames.value = [];
  suiteElapsed.value = 0;
  suiteDone.value = 0;
  suiteTotal.value = targets.length;
  suitePresentationProgress.value = 0;
  suiteHasRun.value = true;
  notice.value = "";
  const samples: Sample[] = [],
    observations: Sample[] = [];
  const progressDuration = API_LOADING_PROGRESS_MIN_MS + Math.random() * 600;
  const checkpoints = [
    { at: 0, progress: 0 },
    { at: 0.18, progress: 22 + Math.random() * 11 },
    { at: 0.29 + Math.random() * 0.06, progress: 0 },
    { at: 0.5, progress: 57 + Math.random() * 9 },
    { at: 0.61 + Math.random() * 0.05, progress: 0 },
    { at: 0.81, progress: 84 + Math.random() * 8 },
    { at: 0.86 + Math.random() * 0.04, progress: 0 },
    { at: 1, progress: 100 },
  ];
  // Repeated checkpoints create brief, varying pauses between bursts of progress.
  for (const index of [2, 4, 6]) {
    checkpoints[index].progress = checkpoints[index - 1].progress;
  }
  // Reveal completed simulation steps gradually, including presentation pauses.
  const progressTimer = window.setInterval(() => {
    const elapsed = (performance.now() - start) / progressDuration;
    const nextIndex = checkpoints.findIndex((point) => point.at > elapsed);
    let presented = 100;
    if (nextIndex > 0) {
      const previous = checkpoints[nextIndex - 1],
        next = checkpoints[nextIndex];
      presented = previous.progress + (next.progress - previous.progress) *
        (elapsed - previous.at) / (next.at - previous.at);
    }
    suitePresentationProgress.value = Math.min(
      presented,
      suiteDone.value / suiteTotal.value * 100,
    );
  }, 40);
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(3, targets.length) }, async () => {
        while (!signal.aborted && next < targets.length) {
          const endpoint = targets[next++];
          const sample = await simulatedSample(endpoint, samples.length, signal);
          samples.push(sample);
          if (disposed) return;
          if (sample.outcome !== "cancelled")
            results.value = { ...results.value, [endpoint.id]: sample };
          suiteDone.value++;
          suiteElapsed.value = performance.now() - start;
          suiteSamples.value = [...samples];
          const stats = summarize(samples);
          suiteFrames.value = [
            ...suiteFrames.value,
            {
              second: suiteElapsed.value / 1000,
              p50: stats.p50,
              p95: stats.p95,
              p99: stats.p99,
              rps: stats.rps,
              concurrency: 0,
              targetRps: 0,
              level: 0,
              phase: "warmup",
              failed: stats.failed,
            },
          ];
        }
      }),
    );
    const elapsedMs = performance.now() - start;
    if (!signal.aborted) {
      await delay(
        Math.max(
          API_LOADING_COMPLETE_MS,
          progressDuration + API_LOADING_COMPLETE_MS - elapsedMs,
        ),
        signal,
      ).catch(
        (error) => {
          if (!signal.aborted) throw error;
        },
      );
    }
    if (disposed) return;
    if (!signal.aborted) {
      const offsets = { ...apiLatencyOffsets.value };
      for (const sample of samples) {
        if (sample.outcome === "cancelled") continue;
        const previous = offsets[sample.endpointId] ?? 0;
        // Select a new fixed offset in ±1 ms, excluding the last displayed offset.
        const previousStep = Math.round(previous * 10) + 10;
        const step = Math.floor(Math.random() * 20);
        offsets[sample.endpointId] = ((step >= previousStep ? step + 1 : step) - 10) / 10;
      }
      apiLatencyOffsets.value = offsets;
    }
    saveReport({
      id: crypto.randomUUID(),
      kind: "suite",
      system,
      startedAt,
      elapsedMs,
      status: signal.aborted ? "stopped" : "completed",
      samples,
      observations,
      frames: [...suiteFrames.value],
      events: [],
    });
    notice.value = signal.aborted
      ? "测试已停止，已完成的结果已保留。"
      : `接口验证完成：${summarize(samples).passed}/${summarize(samples).count} 通过。`;
  } catch (error) {
    notice.value = `测试未完成：${error instanceof Error ? error.message : "请重试"}`;
  } finally {
    window.clearInterval(progressTimer);
    busy.value = null;
    stopping.value = false;
    controller = undefined;
  }
}
async function startLoad() {
  if (busy.value) return;
  detailId.value = null;
  reportId.value = null;
  const system = cloneSystem(activeSystem.value);
  config.value = normalizeConfig(config.value, resolveEndpoints(system));
  runningConfig.value = { ...config.value };
  busy.value = "load";
  stopping.value = false;
  controller = new AbortController();
  notice.value = "";
  lastActivity.value = "load";
  loadState.value = null;
  const startedAt = new Date().toISOString();
  try {
    loadSession = startLoadSession(
      system,
      runningConfig.value,
      controller.signal,
      (state) => {
        if (disposed) return;
        loadState.value = state;
        const last = state.samples.at(-1);
        if (last)
          results.value = {
            ...results.value,
            [last.endpointId]: { ...last, weight: undefined },
          };
      },
    );
    const result = await loadSession.completion;
    if (disposed) return;
    const report: Report = {
      id: crypto.randomUUID(),
      kind: "load",
      system,
      startedAt,
      config: { ...runningConfig.value },
      ...result,
      status: result.status === "stopped" ? "stopped" : "completed",
    };
    saveReport(report);
    if (result.status === "completed") openReport(report);
    notice.value =
      result.status === "stopped"
        ? "压力测试已停止，曲线与样本已保留。"
        : "压力测试完成，曲线、加压事件与报告已归档。";
  } catch (error) {
    notice.value = `压力测试未完成：${error instanceof Error ? error.message : "请重试"}`;
  } finally {
    busy.value = null;
    stopping.value = false;
    controller = undefined;
    loadSession = undefined;
  }
}
function openReport(report: Report) {
  detailId.value = null;
  reportId.value = report.id;
}
function download(report?: Report, format: "json" | "html" = "json") {
  if (!report) return;
  try {
    const url = URL.createObjectURL(
      new Blob([format === "html" ? (report.kind === "special" ? specialReportHtml(report) : loadReportHtml(report)) : JSON.stringify(reportDocument(report), null, 2)], {
        type: format === "html" ? "text/html;charset=utf-8" : "application/json;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `service-test-${report.kind}-${report.id.slice(0, 8)}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = format === "html" ? "HTML 报告已导出，可独立打开、打印或保存为 PDF。" : "报告已导出，包含系统配置、加压过程与观测记录。";
  } catch {
    notice.value = "下载未能生成，请重试；报告仍保留在本次会话中。";
  }
}
onBeforeUnmount(() => {
  disposed = true;
  specialSession.dispose();
  window.clearInterval(latencyDisplayTimer);
  controller?.abort();
});
</script>

<template>
  <div class="console-shell">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="tab = 'overview'"
        ><span class="brand-symbol"><Activity :size="24" /></span
        ><span>服务测试工作台<small>SERVICE OBSERVATORY</small></span></a
      >
      <div class="workspace-label">服务工程 <span>WORKSPACE</span></div>
      <nav aria-label="测试面板导航">
        <button
          v-for="item in tabs"
          :key="item.id"
          :class="{ active: tab === item.id }"
          :aria-current="tab === item.id ? 'page' : undefined"
          @click="tab = item.id"
        >
          <component :is="item.icon" :size="18" /><span>{{ item.label }}</span
          ><span v-if="item.id === 'api'" class="nav-count">{{
            endpoints.length
          }}</span
          ><ChevronRight v-else-if="tab === item.id" :size="14" />
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-note">
          <ShieldCheck :size="21" /><strong>观测 · 验证 · 分析</strong>
          <p>从接口响应到负载表现<br />让运行状态清晰可见</p>
          <span class="tiny-tag">WORKBENCH / V2</span>
        </div>
        <div class="sidebar-footer">
          <span class="status-dot" />服务测试工作区<span>02</span>
        </div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="breadcrumb">
          服务工程<ChevronRight :size="13" /><span>{{
            tabs.find((item) => item.id === tab)?.label
          }}</span>
        </div>
        <div class="system-switcher">
          <Server :size="16" /><label for="active-system">当前系统</label
          ><select
            id="active-system"
            :value="systemStore.activeId"
            :disabled="!!busy"
            @change="switchSystem"
          >
            <option
              v-for="system in systemStore.systems"
              :key="system.id"
              :value="system.id"
            >
              {{ system.name }}
            </option></select
          ><button
            class="secondary small"
            :disabled="!!busy"
            @click="managerOpen = true"
          >
            <Settings2 :size="14" />管理系统
          </button>
        </div>
      </header>
      <main :class="{ 'pressure-page': tab === 'load', 'special-page': tab === 'special' }">
        <section class="page-heading">
          <div>
            <div class="eyebrow">SERVICE ENGINEERING / OBSERVABILITY</div>
            <h1>
              {{
                tab === "overview"
                  ? "让每一次运行，心中有数。"
                  : tab === "api"
                    ? "API 接口验证"
                    : tab === "load"
                      ? "观察系统，如何承受压力。"
                      : tab === "special" ? "并发与边界验证" : "测试记录"
              }}
            </h1>
            <p>
              {{
                tab === "overview"
                  ? "验证接口、逐级加压，完整展示测试验收过程。"
                  : tab === "api"
                    ? "核验响应状态、数据结构与耗时，定位每个请求的完整结果。"
                    : tab === "load"
                      ? "逐级增加并发负载，观察吞吐与延迟如何响应每一次加压。"
                      : tab === "special" ? "准备条件、触发业务操作，逐项核验处理结果。" : "当前系统的测试记录与完整报告，保留每一次验证的上下文。"
              }}
            </p>
          </div>
          <button
            class="secondary export-top"
            :disabled="!latest"
            @click="download(latest)"
          >
            <ArrowDownToLine :size="16" />导出最近报告
          </button>
        </section>
        <div class="context-strip">
          <span><span class="status-dot" />{{ activeSystem.name }}</span
          ><code :title="activeSystem.baseUrl">{{ activeSystem.baseUrl }}</code
          ><span class="context-right"
            >{{ endpoints.length }} 个观测接口 ·
            {{ busy ? "测试进行中" : "观测就绪" }}</span
          >
        </div>
        <div v-if="notice" class="notice" role="status">
          <Activity :size="16" /><span>{{ notice }}</span
          ><button
            class="icon-button"
            aria-label="关闭提示"
            @click="notice = ''"
          >
            <X :size="15" />
          </button>
        </div>
        <section v-if="tab !== 'reports' && tab !== 'special'" class="metrics" aria-label="测试指标">
          <template v-if="pressureMetrics"
            ><article>
              <div class="metric-label">当前并发负载<Cpu :size="17" /></div>
              <div class="metric-value">
                {{ number(lastFrame?.concurrency || 0)
                }}<span>/ {{ chartConfig.concurrency }}</span>
              </div>
              <div class="metric-foot">
                <span class="status-dot" />{{
                  loadState ? phaseName(loadState.phase) : "等待启动"
                }}<small>第 {{ loadState?.level || 0 }} / 5 级</small>
              </div>
            </article>
            <article>
              <div class="metric-label">实时吞吐量<Zap :size="17" /></div>
              <div class="metric-value">
                {{ number(lastFrame?.rps || 0, 1) }}<span>req/s</span>
              </div>
              <div class="metric-foot">
                {{ chartConfig.rps ? `上限 ${number(chartConfig.rps)} req/s` : "按并发与耗时计算" }}<small>当前窗口</small>
              </div>
            </article>
            <article>
              <div class="metric-label">累计完成请求<Check :size="17" /></div>
              <div class="metric-value">
                {{ number(loadStats.count) }}<span>次</span>
              </div>
              <div class="metric-foot">
                <span class="status-dot" />{{
                  loadStats.count
                    ? number(loadStats.successRate, 1) + "% 通过率"
                    : "准备采样"
                }}<small>本轮累计</small>
              </div>
            </article>
            <article>
              <div class="metric-label">
                P95 响应延迟<Activity :size="17" />
              </div>
              <div class="metric-value">
                {{ lastFrame?.p95 ? number(lastFrame.p95, 1) : "—"
                }}<span>ms</span>
              </div>
              <div class="metric-foot">
                {{
                  lastFrame?.p50
                    ? `P50 ${number(lastFrame.p50, 1)} ms`
                    : "等待首个窗口"
                }}<small>当前窗口</small>
              </div>
            </article></template
          >
          <template v-else
            ><article>
              <div class="metric-label">通过接口<ShieldCheck :size="17" /></div>
              <div class="metric-value">
                {{ suiteStats.passed }}<span>/ {{ suiteStats.count }}</span>
              </div>
              <div class="metric-foot">
                <span class="status-dot" />{{
                  number(suiteStats.successRate, 1)
                }}% 通过率<small>{{
                  suiteHasRun ? "本轮验证" : "运行概览"
                }}</small>
              </div>
            </article>
            <article>
              <div class="metric-label">P50 响应延迟<Clock3 :size="17" /></div>
              <div
                class="metric-value"
                :title="`原始 P50：${number(suiteStats.p50, 1)} ms；展示波动 ±2 ms`"
              >
                {{ suiteStats.count ? number(suiteCardLatency.p50, 1) : "—"
                }}<span>ms</span>
              </div>
              <div class="metric-foot">
                50% 请求的耗时不高于此值<small>展示 ±2 ms</small>
              </div>
            </article>
            <article>
              <div class="metric-label">
                P95 响应延迟<Activity :size="17" />
              </div>
              <div
                class="metric-value"
                :title="`原始 P95：${number(suiteStats.p95, 1)} ms；展示波动 ±2 ms`"
              >
                {{ suiteStats.count ? number(suiteCardLatency.p95, 1) : "—"
                }}<span>ms</span>
              </div>
              <div class="metric-foot">
                观察高分位响应表现<small>展示 ±2 ms</small>
              </div>
            </article>
            <article>
              <div class="metric-label">断言通过<Check :size="17" /></div>
              <div class="metric-value">
                {{
                  suiteSamples.reduce(
                    (n, s) => n + s.checks.filter((c) => c.passed).length,
                    0,
                  )
                }}<span
                  >/
                  {{
                    suiteSamples.reduce((n, s) => n + s.checks.length, 0)
                  }}</span
                >
              </div>
              <div class="metric-foot">
                状态码 · 数据结构 · 耗时<small>三项校验</small>
              </div>
            </article></template
          >
        </section>

        <SpecialWorkspace v-show="tab === 'special'" :key="activeSystem.id" :runs="specialRuns" :busy="!!busy" :busy-id="specialBusyId" @advance="advanceSpecial" @reset="resetScenario" @report="saveSpecialReport" />

        <div
          v-if="tab === 'overview' || tab === 'api'"
          class="content-grid"
          :class="{ 'api-view': tab === 'api' }"
        >
          <section class="panel api-panel">
            <div class="panel-heading">
              <div>
                <h2>
                  <Code2 :size="18" />API 测试情况<span class="count-tag"
                    >{{ endpoints.length }} 项</span
                  >
                </h2>
                <p>{{ activeSystem.name }} · 关键接口与契约验证</p>
              </div>
              <button
                class="primary small"
                :disabled="!!busy"
                @click="runSuite()"
              >
                <Play :size="14" />运行全部
              </button>
            </div>
            <div class="table-toolbar">
              <input
                v-model="search"
                aria-label="搜索接口"
                placeholder="搜索接口名称或路径…"
              /><select v-model="groupFilter" aria-label="筛选用例分组">
                <option value="all">全部分组</option>
                <option v-for="group in endpointGroups" :key="group" :value="group">{{ group }}</option>
              </select><select v-model="filter" aria-label="筛选测试状态">
                <option value="all">全部状态</option>
                <option value="passed">通过</option>
                <option value="cancelled">已取消</option>
              </select>
            </div>
            <div class="api-table-wrap">
              <table class="api-table">
                <thead>
                  <tr>
                    <th>接口 / 用例</th>
                    <th>状态</th>
                    <th title="每次测试完成后更新；点击接口查看原始耗时">耗时</th>
                    <th>结果</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="endpoint in visibleEndpoints" :key="endpoint.id">
                    <td>
                      <button
                        class="endpoint-link"
                        @click="detailId = endpoint.id"
                      >
                        <span class="endpoint-name">{{ endpoint.name }}</span
                        ><span class="endpoint-path"
                          ><b>GET</b>{{ endpoint.path }}</span
                        >
                      </button>
                    </td>
                    <td>
                      <span
                        class="result-badge"
                        :class="results[endpoint.id]?.outcome || 'pending'"
                        ><span class="status-dot" />{{
                          resultName(results[endpoint.id])
                        }}</span
                      >
                    </td>
                    <td
                      class="mono timing"
                      :title="results[endpoint.id] ? `原始耗时：${number(results[endpoint.id].elapsedMs, 1)} ms；本轮展示偏移 ±1 ms，测试完成后更新` : undefined"
                    >
                      {{
                        results[endpoint.id]
                          ? number(Math.max(0, results[endpoint.id].elapsedMs + (apiLatencyOffsets[endpoint.id] || 0)), 1)
                          : "—"
                      }}<small>ms</small>
                    </td>
                    <td>
                      <button
                        class="detail-link"
                        :aria-label="`查看${endpoint.name}结果`"
                        @click="detailId = endpoint.id"
                      >
                        {{ results[endpoint.id]?.status ?? "—"
                        }}<ChevronRight :size="13" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-if="!visibleEndpoints.length" class="empty-state">
                没有符合条件的接口，请调整搜索或筛选。
              </div>
            </div>
            <div class="panel-footer">
              <span><ShieldCheck :size="13" />GET · 状态 / 结构 / 耗时</span
              ><span>{{
                busy === "suite"
                  ? `验证中 ${suitePresentedDone} / ${suiteTotal}`
                  : "点击接口查看完整响应"
              }}</span>
            </div>
          </section>
          <section v-if="tab === 'overview'" class="panel quick-load v2-quick">
            <div class="panel-heading">
              <div>
                <h2><Gauge :size="18" />压力测试</h2>
                <p>
                  {{
                    loadState
                      ? phaseName(loadState.phase)
                      : "预热 → 五级加压 → 峰值保持"
                  }}
                </p>
              </div>
              <span class="tiny-tag">{{
                loadState ? `${loadState.level} / 5 级` : "RAMP UP"
              }}</span>
            </div>
            <div class="quick-pressure-number">
              <strong>{{
                loadState
                  ? number(lastFrame?.concurrency || 0)
                  : config.concurrency
              }}</strong
              ><span>{{ loadState ? "当前并发负载" : "目标并发负载" }}</span
              ><span class="quick-duration"
                >{{
                  loadState
                    ? (loadState.elapsedMs / 1000).toFixed(1)
                    : 0
                }}<small> / {{ chartConfig.duration }} s</small></span
              >
            </div>
            <div class="level-track">
              <i
                v-for="level in 5"
                :key="level"
                :class="{ lit: (loadState?.level || 0) >= level }"
              />
            </div>
            <template v-if="loadState"
              ><div class="quick-chart-heading">
                <strong>负载与吞吐</strong
                ><span class="chart-legend"
                  ><i />并发 <i class="amber-line" />req/s</span
                >
              </div>
              <TrendChart
                kind="load"
                :frames="loadState.frames"
                :events="loadState.events"
                :duration="runningConfig.duration"
                :concurrency="runningConfig.concurrency"
                :rps="runningConfig.rps"
                compact
                label="总览负载与吞吐趋势"
            /></template>
            <div v-else class="quick-pressure-idle">
              <Activity :size="35" />
              <p>负载逐级抬升，响应变化实时可见</p>
            </div>
            <button
              v-if="busy !== 'load'"
              class="primary full"
              :disabled="!!busy"
              @click="startLoad()"
            >
              <Play :size="15" />启动压力测试</button
            ><button
              v-else
              class="boost-button full"
              :disabled="!canIncrease"
              @click="increase"
            >
              <Plus :size="16" />{{
                canIncrease ? "加压一级" : "已达目标负载"
              }}</button
            ><button class="text-button" @click="tab = 'load'">
              {{ loadState ? "进入完整观测" : "配置测试参数"
              }}<ArrowRight :size="14" />
            </button>
            <div class="quick-latency">
              <div class="quick-chart-heading">
                <strong>响应延迟趋势</strong
                ><span class="chart-legend"
                  ><i />P50 <i class="light-line" />P95</span
                >
              </div>
              <TrendChart
                :frames="pressureMetrics && loadState ? loadState.frames : suiteTrendFrames"
                :duration="pressureMetrics && loadState ? runningConfig.duration : suiteTrendDuration"
                :latency-max="pressureMetrics && loadState ? loadEndpoint.budget : undefined"
                prominent
                label="总览响应延迟趋势"
              />
            </div>
          </section>
        </div>

        <div v-if="tab === 'load' && latestLoadReport && !busy" class="load-report-entry">
          <div><FileText :size="18" /><span>最近一轮压测{{ latestLoadReport.status === 'completed' ? '已完成' : '已停止' }}，报告已保存</span></div>
          <button class="secondary" @click="openReport(latestLoadReport)">查看压测报告<ArrowRight :size="14" /></button>
        </div>
        <div v-if="tab === 'load'" class="pressure-layout">
          <section class="panel pressure-config">
            <div class="panel-heading">
              <div>
                <h2><Settings2 :size="18" />负载配置</h2>
                <p>定义本轮测试的目标与节奏</p>
              </div>
            </div>
            <fieldset :disabled="!!busy">
              <label
                >目标接口<select
                  v-model="config.endpointId"
                  aria-label="目标接口"
                >
                  <option
                    v-for="endpoint in endpoints"
                    :key="endpoint.id"
                    :value="endpoint.id"
                  >
                    {{ endpoint.name }} · {{ endpoint.path }}
                  </option>
                </select></label
              ><label
                >目标并发<input
                  v-model.number="config.concurrency"
                  type="number"
                  min="5"
                  max="1000"
              /></label>
              <div class="input-pair">
                <label
                  >测试时长（秒）<input
                    v-model.number="config.duration"
                    type="number"
                    min="10"
                    max="120" /></label
                ><label
                  >吞吐上限（req/s）<input
                    v-model.number="config.rps"
                    type="number"
                    min="0"
                    max="50000"
                /></label>
              </div>
            </fieldset>
            <button
              class="primary full"
              :disabled="!!busy"
              @click="startLoad()"
            >
              <Play :size="15" />启动压力测试
            </button>
            <div class="strategy-card">
              <span class="tiny-tag">STEP LOAD</span>
              <h3>五级递增加压</h3>
              <div class="strategy-steps">
                <i
                  v-for="level in 5"
                  :key="level"
                  :style="{ height: `${10 + level * 7}px` }"
                />
              </div>
              <p>
                预热后自动升档，也可随时手动加压。达到目标后保持峰值，直到本轮结束。
              </p>
            </div>
            <div class="config-limit">
              并发 5–1,000 · 时长 10–120 s<br />吞吐上限为 0 时，按并发数与平均响应耗时自动计算；累计完成数按时间累加。
            </div>
            <button
              v-if="busy === 'load'"
              class="secondary full"
              :disabled="stopping"
              @click="stop"
            >
              <Square :size="13" />停止测试
            </button>
            <div class="config-system">
              <Server :size="15" />
              <div>
                {{ activeSystem.name }}<code>{{ activeSystem.baseUrl }}</code>
              </div>
            </div>
          </section>
          <div class="pressure-observation">
            <section class="panel load-chart-panel">
              <div class="panel-heading">
                <div>
                  <h2><Gauge :size="19" />负载与吞吐</h2>
                  <p>并发负载逐级抬升，观察每秒请求完成量的变化</p>
                </div>
                <div class="pressure-main-actions">
                  <span
                    class="phase-badge"
                    :class="{ running: busy === 'load' }"
                    ><span class="status-dot" />{{
                      loadState ? phaseName(loadState.phase) : "等待启动"
                    }}</span
                  ><button
                    class="boost-button"
                    :disabled="!canIncrease"
                    @click="increase"
                  >
                    <Plus :size="17" />加压一级
                  </button>
                </div>
              </div>
              <div class="pressure-stage">
                <div>
                  <small>当前负载阶段</small
                  ><strong
                    >第 <b>{{ loadState?.level || 0 }}</b> / 5 级</strong
                  >
                </div>
                <div class="stage-stair">
                  <span
                    v-for="level in 5"
                    :key="level"
                    :class="{ active: (loadState?.level || 0) >= level }"
                    ><i :style="{ height: `${9 + level * 6}px` }" /><small>{{
                      Math.round((chartConfig.concurrency * level) / 5)
                    }}</small></span
                  >
                </div>
                <div class="stage-time">
                  <strong
                    >{{ number((loadState?.elapsedMs || 0) / 1000, 1)
                    }}<small> / {{ chartConfig.duration }} s</small></strong
                  ><span>{{
                    loadState?.status === "completed"
                      ? "本轮已完成"
                      : loadState?.status === "stopped"
                        ? "保留停止时曲线"
                        : "逐级接近目标负载"
                  }}</span>
                </div>
              </div>
              <TrendChart
                kind="load"
                :frames="loadState?.frames || []"
                :events="loadState?.events || []"
                :duration="chartConfig.duration"
                :concurrency="chartConfig.concurrency"
                :rps="chartConfig.rps"
                label="并发负载与吞吐曲线"
              />
              <div class="chart-footer">
                <span class="chart-legend"
                  ><i />并发负载 <i class="amber-line" />实时吞吐量</span
                ><span>左轴：并发 · 右轴：req/s · ＋：手动加压</span>
              </div>
            </section>
            <section class="panel latency-live-panel">
              <div class="panel-heading">
                <div>
                  <h2><Activity :size="18" />响应延迟趋势</h2>
                  <p>随负载升高与加压事件变化的窗口分位数</p>
                </div>
                <div class="inline-percentiles">
                  <span
                    >P50 <b>{{ number(lastFrame?.p50 || 0, 1) }}</b></span
                  ><span
                    >P95 <b>{{ number(lastFrame?.p95 || 0, 1) }}</b></span
                  ><span
                    >P99 <b>{{ number(lastFrame?.p99 || 0, 1) }}</b
                    ><small> ms</small></span
                  >
                </div>
              </div>
              <TrendChart
                :frames="loadState?.frames || []"
                :duration="chartConfig.duration"
                :latency-max="loadEndpoint.budget"
                compact
                label="压力测试延迟分位数曲线"
              />
              <div class="chart-footer">
                <span class="chart-legend"
                  ><i />P50 <i class="light-line" />P95</span
                ><span>响应预算 {{ loadEndpoint.budget }} ms</span>
              </div>
            </section>
            <section class="event-strip" aria-label="加压事件">
              <span><Clock3 :size="14" />加压事件</span>
              <p v-if="!recentEvents.length">自动升档和手动加压将在这里留痕</p>
              <span
                v-for="event in recentEvents"
                :key="event.id"
                class="event-chip"
                :class="{ manual: event.type === 'manual' }"
                >{{ event.second.toFixed(1) }} s ·
                {{ event.type === "manual" ? "手动" : "自动" }} →
                {{ event.level }} 级</span
              >
            </section>
          </div>
        </div>

        <section v-if="tab === 'api'" class="panel api-latency">
          <div class="panel-heading">
            <div>
              <h2><Activity :size="18" />响应延迟趋势</h2>
              <p>随上方 P50 / P95 卡片实时更新</p>
            </div>
            <span class="chart-legend"
              ><i />P50 <i class="light-line" />P95</span
            >
          </div>
          <TrendChart
            :frames="suiteTrendFrames"
            :duration="suiteTrendDuration"
            label="接口验证延迟趋势"
          />
        </section>
        <section v-if="tab === 'reports'" class="panel reports-panel">
          <div class="panel-heading">
            <div>
              <h2><FileText :size="18" />{{ activeSystem.name }} · 会话记录</h2>
              <p>
                全工作区最多保留 8 次测试和 24,000
                条数据记录；刷新页面前请导出所需报告。
              </p>
            </div>
            <span class="count-tag">{{ visibleReports.length }} 份报告</span>
          </div>
          <div v-if="!visibleReports.length" class="empty-state report-empty">
            <FileText :size="35" stroke-width="1.2" />
            <h3>第一份验证报告，从运行开始</h3>
            <p>执行接口验证、压力测试或专项验证后，在这里回看完整结果。</p>
            <button class="primary" :disabled="!!busy" @click="runSuite()">
              <Play :size="15" />运行接口验证
            </button>
          </div>
          <article
            v-for="report in visibleReports"
            :key="report.id"
            class="report-row"
          >
            <span class="report-icon"
              ><Code2 v-if="report.kind === 'suite'" :size="20" /><ShieldCheck v-else-if="report.kind === 'special'" :size="20" /><Gauge
                v-else
                :size="20"
            /></span>
            <div class="report-main">
              <strong
                >{{ report.kind === "suite" ? "API 接口验证" : report.kind === "special" ? "专项验收报告" : "阶梯压力测试"
                }}<span class="tiny-tag">{{ report.system.name }}</span></strong
              >
              <p>
                {{ time(report.startedAt) }} ·
                {{ (report.elapsedMs / 1000).toFixed(1) }} s ·
                {{ report.status === "stopped" ? (report.kind === "special" ? "阶段记录" : "已停止") : "已完成" }}
              </p>
              <code
                >{{ report.id.slice(0, 8).toUpperCase()
                }}<span v-if="report.kind === 'load'">
                  ·
                  {{ report.events.filter((e) => e.type === "manual").length }}
                  次手动加压</span
                ></code
              >
            </div>
            <template v-if="report.kind === 'special'">
              <div class="report-stats"><strong>{{ specialSummary(report).completed }} / 6</strong><small>已核验场景</small></div>
              <div class="report-stats"><strong>{{ specialSummary(report).passed }} / {{ specialSummary(report).assertions }}</strong><small>断言通过</small></div>
            </template>
            <template v-else>
            <div class="report-stats">
              <strong
                >{{ number(summarize(report.samples).successRate, 1) }}%</strong
              ><small
                >通过率 ·
                {{ number(summarize(report.samples).count) }} 次请求</small
              >
            </div>
            <div class="report-stats">
              <strong
                >{{ number(summarize(report.samples).p95, 1) }}
                <small>ms</small></strong
              ><small>P95 延迟</small>
            </div>
            </template>
            <button v-if="report.kind !== 'suite'" class="secondary" @click="openReport(report)">
              <FileText :size="15" />查看报告
            </button>
            <button
              class="secondary"
              :aria-label="`导出报告 ${report.id.slice(0, 8)}`"
              @click="download(report)"
            >
              <ArrowDownToLine :size="15" />JSON
            </button>
          </article>
        </section>
        <footer class="page-footer">
          <span><Activity :size="14" />服务测试工作台</span
          ><span>HTTP 契约验证 · 阶梯负载观测 · 窗口延迟分析</span>
        </footer>
      </main>
    </div>
    <div
      v-if="busy && busy !== 'special' && (tab !== 'load' || busy === 'suite')"
      class="run-dock"
      role="status"
    >
      <div class="run-pulse"><Activity :size="20" /></div>
      <div>
        <strong>{{
          stopping
            ? "正在停止…"
            : busy === "suite"
              ? "正在验证 API 接口"
              : `${phaseName(loadState?.phase || "warmup")} · 第 ${loadState?.level || 0} / 5 级`
        }}</strong
        ><span>{{
          busy === "suite"
            ? `${suitePresentedDone} / ${suiteTotal} 已完成`
            : `${number((loadState?.elapsedMs || 0) / 1000, 1)} / ${runningConfig.duration} 秒 · ${number(loadStats.count)} 次请求`
        }}</span>
      </div>
      <div
        class="dock-progress"
        role="progressbar"
        :aria-valuenow="Math.round(progress)"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="测试进度"
      >
        <i :style="{ width: progress + '%' }" />
      </div>
      <button
        v-if="busy === 'load' && tab !== 'load' && tab !== 'overview'"
        class="boost-button"
        :disabled="!canIncrease"
        @click="increase"
      >
        <Plus :size="13" />加压一级</button
      ><button class="secondary" :disabled="stopping" @click="stop">
        <Square :size="13" />停止测试
      </button>
    </div>
    <ModalFrame
      v-if="busy === 'suite'"
      title="API 接口验证"
      @close="stop"
    >
      <div
        class="api-loading"
        :class="suitePresentedDone === 0 ? 'is-pending' : suitePresentedDone < suiteTotal ? 'is-running' : 'is-complete'"
        role="status"
        aria-live="polite"
      >
        <div class="api-loading-mark" aria-hidden="true">
          <span class="api-loading-spinner" />
          <Code2 :size="25" />
        </div>
        <h3>{{ stopping ? '正在停止…' : '正在验证 API 接口' }}</h3>
        <p>{{ activeSystem.name }} · 状态码、数据结构与响应耗时</p>
        <div
          class="api-loading-meter"
          role="progressbar"
          aria-label="API 核验进度"
          :aria-valuenow="Math.floor(suitePresentationProgress)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuetext="`已核验 ${suitePresentedDone} / ${suiteTotal} 项`"
        >
          <span
            class="api-loading-meter-fill"
            :style="{ width: `${suitePresentationProgress}%` }"
          />
        </div>
        <span class="api-loading-progress">已核验 {{ suitePresentedDone }} / {{ suiteTotal }} 项</span>
      </div>
      <div class="dialog-footer">
        <span>完成后展示本轮结果</span>
        <button class="secondary" :disabled="stopping" @click="stop">
          <Square :size="13" />停止验证
        </button>
      </div>
    </ModalFrame>
    <SpecialReportView v-if="selectedSpecialReport" :report="selectedSpecialReport" @close="reportId = null" @json="download(selectedSpecialReport)" @html="download(selectedSpecialReport, 'html')" />
    <LoadReport
      v-if="selectedLoadReport"
      :report="selectedLoadReport"
      @close="reportId = null"
      @json="download(selectedLoadReport)"
      @html="download(selectedLoadReport, 'html')"
    />
    <SystemManager
      v-if="managerOpen"
      :systems="systemStore.systems"
      :active-id="systemStore.activeId"
      @close="managerOpen = false"
      @save="saveSystems"
      @register="registerSystems"
    />
    <ModalFrame v-if="selected" :title="selected.name" @close="detailId = null"
      ><div class="detail-body">
        <p class="detail-url mono">
          GET {{ activeSystem.baseUrl.replace(/\/$/, "") }}{{ selected.path }}
        </p>
        <template v-if="selectedResult"
          ><div class="detail-summary">
            <span class="result-badge" :class="selectedResult.outcome">{{
              resultName(selectedResult)
            }}</span
            ><span
              >{{ selectedResult.elapsedMs }} ms ·
              {{ number(selectedResult.bytes) }} B</span
            >
          </div>
          <h3>断言结果</h3>
          <div
            v-for="check in selectedResult.checks"
            :key="check.label"
            class="assertion"
            :class="{ 'text-danger': !check.passed }"
          >
            <Check v-if="check.passed" :size="16" /><X
              v-else
              :size="16"
            /><span>{{ check.label }}</span>
          </div>
          <p class="request-id">
            Request ID <code>{{ selectedResult.requestId }}</code>
          </p>
          <h3>响应预览 <small>最多展示 6,000 字符</small></h3>
          <pre tabindex="0">{{
            selectedResult.preview || selectedResult.error || "无响应内容"
          }}</pre>
          </template
        >
        <div v-else class="empty-state">此接口尚未测试。</div>
      </div>
      <div class="dialog-footer">
        <span>响应数据与断言结果随报告一起保存</span
        ><button
          class="primary"
          :disabled="!!busy"
          @click="runSuite(selected.id)"
        >
          <Play :size="14" />单独重测
        </button>
      </div></ModalFrame
    >
  </div>
</template>
