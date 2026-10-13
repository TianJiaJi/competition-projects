<script setup lang="ts">
import PreviewTools from "./components/PreviewTools.vue";
import {
  computed,
  reactive,
  ref,
  onMounted,
  onBeforeUnmount,
  watch,
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
} from "vue";
import { scenario as baseScenario } from "../../../scenario/config";
import {
  demoScenario,
  ROLE,
  facilityFor,
  C01,
  type DemoWorkOrder,
} from "@scene/demo";
import { demo, savedIdentity, saveIdentity, connectDemo } from "./demo";
import { parsePreview, createPreviewClient } from "@scene/demo/builder";
import type {
  LinkedRecord,
  Records,
  Terminal,
} from "@scene/demo/builder-types";
import { schoolScenario } from "@scene/demo/school";
const entryQuery = new URLSearchParams(location.search);
const legacyEntry =
  !entryQuery.has("caseId") &&
  ["template", "campus-map", "campus-ready"].includes(
    entryQuery.get("stage") || "",
  );
const preview = parsePreview(
  legacyEntry ? "" : location.search,
  __TERMINAL__ as Terminal,
);
const previewStatus = reactive({
  ready: false,
  error: "",
  fatal: false,
  updatedAt: "",
});
const entryError = computed(
  () =>
    preview.error ||
    (previewStatus.fatal ? previewStatus.error : "") ||
    demo.error,
);
const spaceOnly = preview.context?.stage === "01";
const scenario = preview.enabled
  ? schoolScenario()
  : demo.context
    ? demoScenario(baseScenario, demo.context.stage)
    : baseScenario;
import {
  createState,
  metrics,
  createRecord,
  claim,
  complete,
  type Collection,
  type RecordItem,
} from "@scene/domain";
import {
  LiquidGlassButton as GlassButton,
  LiquidGlassSurface as GlassSurface,
} from "@scene/ui/liquid-glass";
import { ContourBackground } from "@scene/ui/contour";
import { RecordRackNav } from "@scene/ui/record-rack";
import { ScenicChart } from "@scene/ui/charts";
import { InkProgress, ScenicLoadingScreen } from "@scene/ui/progress";
import { ScrollArea, installScrollbars } from "@scene/ui/scrollbar";
import {
  ArrowUpRight,
  ArrowRight,
  Sun,
  Moon,
  Building2,
  GraduationCap,
  Clock3,
  MapPin,
  LogOut,
  Check,
  Menu,
} from "lucide-vue-next";
import { dark, brandColor, themeColors } from "./theme";
import OperationsMonitor from "./components/OperationsMonitor.vue";
import Drawer from "./components/Drawer.vue";
import RecordList from "./components/RecordList.vue";
import Editor from "./components/Editor.vue";
import StatusTag from "./components/StatusTag.vue";
import PublicStage from "./components/PublicStage.vue";
const ModelBrowser = defineAsyncComponent({
  loader: () => import("./components/ModelBrowser.vue"),
  errorComponent: defineComponent({
    setup() {
      modelFailed.value = true;
      return () => h("p", { role: "alert" }, "沙盘加载失败，请刷新重试");
    },
  }),
  onError(_error, _retry, fail) {
    modelFailed.value = true;
    fail();
  },
});
const terminal = __TERMINAL__;
const state = reactive(createState(scenario));
if (preview.context?.stage === "03")
  for (const key of Object.keys(state.records) as Collection[])
    state.records[key] = [];
let previewClient: ReturnType<typeof createPreviewClient> | undefined;
const actionBusy = ref(false);
async function action(work: () => Promise<void>) {
  if (actionBusy.value) return;
  actionBusy.value = true;
  error.value = "";
  try {
    await work();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    actionBusy.value = false;
  }
}
if (demo.context) state.identity = savedIdentity();
watch(
  () => state.identity,
  (value) => saveIdentity(value),
);
const facilityFilter = ref("");
const filterFacilities = (items: RecordItem[]) =>
  (!demo.context && !preview.enabled) || !facilityFilter.value
    ? items
    : items.filter(
        (item) => (item as DemoWorkOrder).facilityId === facilityFilter.value,
      );
const mapRef = ref<InstanceType<typeof ModelBrowser>>();
const pendingDemoFocus = ref(false);
const demoReloaded = performance
  .getEntriesByType("navigation")
  .some((entry) => (entry as PerformanceNavigationTiming).type === "reload");
function currentPage() {
  if (terminal === "ops") {
    if (location.hash && location.hash !== "#/overview")
      history.replaceState(
        null,
        "",
        location.pathname + location.search + "#/overview",
      );
    return "overview";
  }
  return location.hash.slice(2) || "overview";
}
const page = ref(currentPage());
const modelActive = computed(
  () =>
    !entryError.value &&
    (!preview.enabled || previewStatus.ready) &&
    (terminal === "preview" ||
      (terminal === "public" && (spaceOnly || page.value === "overview"))),
);
const sceneOverview = computed(
  () => terminal === "public" && (spaceOnly || page.value === "overview"),
);
const modelProgress = ref(0);
const modelIntroState = ref("loading");
const modelPrepared = ref(false);
const progressPainted = ref(false);
const modelFailed = ref(false);
const modelLoading = computed(
  () =>
    modelActive.value &&
    !modelFailed.value &&
    !(modelPrepared.value && progressPainted.value),
);
watch(
  modelActive,
  () => {
    modelIntroState.value = "loading";
    modelProgress.value = 0;
    modelPrepared.value = false;
    progressPainted.value = false;
    modelFailed.value = false;
  },
  { flush: "sync" },
);
function modelStateChanged(state: string) {
  modelIntroState.value = state;
  if (state === "failed") modelFailed.value = true;
  else if (state !== "loading") modelPrepared.value = true;
}
const selected = ref<RecordItem | null>(null),
  editing = ref(false),
  creating = ref(false);
const menuOpen = ref(false);
const toast = ref("");
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const result = ref(""),
  error = ref("");
const credentials = reactive({
  username: terminal === "admin" ? "admin01" : "staff01",
  password: "123456",
});
const loginError = ref("");
const locked = computed(
  () => ["admin", "staff"].includes(terminal) && !state.identity,
);
const title = computed(() =>
  page.value === "overview"
    ? {
        public: "空间与生活",
        ops: "运行总览",
        admin: "工作台",
        staff: "今日任务",
        preview: "组件与交互",
      }[terminal]
    : page.value === "venues"
      ? "场馆信息"
      : (scenario.labels[page.value as Collection] ?? "页面未找到"),
);
const collection = computed(() => page.value as Collection);
const nav = computed(() =>
  terminal === "admin"
    ? scenario.navigation.flatMap((g) => g.items)
    : terminal === "public"
      ? [
          { id: "overview", label: "总览" },
          { id: "facilities", label: scenario.labels.facilities },
          {
            id: scenario.kind === "community" ? "parking" : "venues",
            label: scenario.kind === "community" ? "停车信息" : "场馆信息",
          },
          { id: "notices", label: "公告" },
        ]
      : terminal === "ops"
        ? [{ id: "overview", label: "运行总览" }]
        : [
            { id: "overview", label: "今日任务" },
            { id: "tasks", label: "任务列表" },
            { id: "inspections", label: "巡检计划" },
            { id: "history", label: "历史记录" },
          ],
);
const figures = computed(() => metrics(state, scenario));
const items = computed(() =>
  filterFacilities(
    page.value === "venues"
      ? state.records.facilities.filter((r) => r.capacity)
      : page.value === "history"
        ? [...state.records.tasks, ...state.records.inspections].filter(
            (r) => r.status === "已完成",
          )
        : (state.records[collection.value] ?? []),
  ),
);
const activeTasks = computed(() =>
  filterFacilities(
    [...state.records.tasks, ...state.records.inspections].filter(
      (r) => r.status !== "已完成",
    ),
  ),
);
const terminalLabel = {
  public: "公共服务",
  ops: "运行监控",
  staff: `${scenario.worker}工作台`,
  admin: "管理中心",
  preview: "交互样本",
}[terminal];
const chartMode = ref<"electricity" | "water">("electricity");
const chart = computed(() => ({
  color: [brandColor.value],
  grid: { left: terminal === "ops" ? 36 : 46, right: 16, top: 16, bottom: 30 },
  tooltip: {
    trigger: "axis",
    backgroundColor:
      terminal === "ops"
        ? themeColors.value.surface
        : dark.value
          ? "#293039"
          : scenario.theme.surface,
    textStyle: {
      color:
        terminal === "ops"
          ? themeColors.value.ink
          : dark.value
            ? "#eee"
            : scenario.theme.ink,
    },
  },
  xAxis: {
    type: "category",
    data: scenario.usage.labels,
    boundaryGap: false,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      fontSize: terminal === "ops" ? 10 : 12,
      color:
        terminal === "ops"
          ? themeColors.value.muted
          : dark.value
            ? "#bbc0c7"
            : scenario.theme.muted,
    },
  },
  yAxis: {
    type: "value",
    splitNumber: terminal === "ops" ? 3 : 5,
    axisLabel: {
      fontSize: terminal === "ops" ? 10 : 12,
      color:
        terminal === "ops"
          ? themeColors.value.muted
          : dark.value
            ? "#bbc0c7"
            : scenario.theme.muted,
    },
    splitLine: {
      lineStyle: {
        color:
          terminal === "ops"
            ? themeColors.value.line
            : dark.value
              ? "#434850"
              : scenario.theme.line,
        type: "dashed",
      },
    },
  },
  series: [
    {
      name: chartMode.value === "electricity" ? "用电量 kWh" : "用水量 m³",
      type: "line",
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 3 },
      areaStyle: { opacity: 0.12 },
      data: scenario.usage[chartMode.value],
    },
  ],
}));
const usageChart = computed(() => ({
  ...chart.value,
  series: [
    {
      name: scenario.kind === "community" ? "停车使用率 %" : "空间使用率 %",
      type: "bar",
      barWidth: 15,
      itemStyle: { borderRadius: [6, 6, 0, 0] },
      data: scenario.usage.occupancy,
    },
  ],
}));
const rackTheme = computed(() => ({
  "--rack-text": dark.value ? "#f3f0ea" : scenario.theme.ink,
  "--rack-muted": dark.value ? "#babfc7" : scenario.theme.muted,
  "--rack-accent": brandColor.value,
  "--rack-active": dark.value ? "#e6c6a8" : scenario.theme.brand,
  "--rack-tint": dark.value ? "43 48 55" : "255 252 247",
}));
function focusPreview() {
  pendingDemoFocus.value = true;
  if (page.value === "overview" || spaceOnly) {
    pendingDemoFocus.value = false;
    mapRef.value?.focusFacility("F4");
  } else go("overview");
}
function go(id: string) {
  page.value = id;
  location.hash = "/" + id;
  selected.value = null;
  editing.value = false;
  creating.value = false;
  menuOpen.value = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function sync() {
  page.value = currentPage();
  selected.value = null;
  editing.value = false;
  creating.value = false;
}
function inform(message: string) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 3000);
}
async function login() {
  if (previewClient) {
    if (actionBusy.value) return;
    actionBusy.value = true;
    try {
      await previewClient.login(credentials.username, credentials.password);
      loginError.value = "";
    } catch (e) {
      loginError.value = (e as Error).message;
    } finally {
      actionBusy.value = false;
    }
    return;
  }
  if (
    credentials.username === (terminal === "admin" ? "admin01" : "staff01") &&
    credentials.password === "123456"
  ) {
    state.identity =
      terminal === "admin" ? "管理员" : demo.context ? ROLE : "陈越";
    loginError.value = "";
  } else loginError.value = "账号或密码不正确，请使用页面所示的演示账号";
}
function select(item: RecordItem) {
  selected.value = item;
  editing.value = false;
  result.value = "";
  error.value = "";
}
async function logout() {
  if (previewClient) {
    await action(async () => {
      await previewClient!.logout();
    });
  } else state.identity = null;
}
async function save(input: Omit<RecordItem, "id">) {
  if (previewClient) {
    await action(async () => {
      await previewClient!.write(
        collection.value,
        selected.value?.id,
        "save",
        input,
      );
      selected.value = null;
      creating.value = false;
      editing.value = false;
      inform("已保存");
    });
    return;
  }
  if (selected.value) Object.assign(selected.value, input);
  else createRecord(state, collection.value, input);
  selected.value = null;
  creating.value = false;
  editing.value = false;
  inform("已保存");
}
function recordCollection(item: RecordItem): Collection {
  return state.records.inspections.some((r) => r.id === item.id)
    ? "inspections"
    : "tasks";
}
async function claimTask() {
  if (!selected.value) return;
  if (previewClient) {
    await action(async () => {
      await previewClient!.write(
        recordCollection(selected.value!),
        selected.value!.id,
        "claim",
      );
      inform("已领取任务");
    });
  } else {
    claim(selected.value, state.identity!);
    inform("已领取任务");
  }
}
async function finish() {
  if (previewClient && selected.value) {
    await action(async () => {
      await previewClient!.write(
        recordCollection(selected.value!),
        selected.value!.id,
        "complete",
        { result: result.value },
      );
      inform("处理结果已记录");
    });
    return;
  }
  if (!selected.value) return;
  error.value = complete(selected.value, result.value);
  if (!error.value) inform("处理结果已记录");
}
let stopScroll: (() => void) | undefined;
let demoBridge: ReturnType<typeof connectDemo> | undefined;
const demoVisible = () =>
  !locked.value &&
  !demo.error &&
  (terminal !== "public" ||
    (page.value === "overview" &&
      modelIntroState.value === "ready" &&
      !modelLoading.value));
watch(
  [locked, modelLoading, modelIntroState, page],
  async () => {
    await nextTick();
    if (pendingDemoFocus.value && demoVisible()) {
      pendingDemoFocus.value = false;
      mapRef.value?.focusFacility("F4");
    }
    demoBridge?.announce();
    previewClient?.announce();
  },
  { flush: "post" },
);
onMounted(() => {
  window.addEventListener("hashchange", sync);
  stopScroll = installScrollbars();
  if (demo.context) demoBridge = connectDemo(demoVisible);
  if (preview.context)
    previewClient = createPreviewClient(
      preview.context,
      state,
      previewStatus,
      () =>
        !locked.value &&
        (terminal !== "public" ||
          modelIntroState.value === "ready" ||
          page.value !== "overview"),
    );
});
onBeforeUnmount(() => {
  window.removeEventListener("hashchange", sync);
  stopScroll?.();
  demoBridge?.dispose();
  previewClient?.dispose();
  clearTimeout(toastTimer);
});
</script>
<template>
  <div v-if="entryError" class="demo-error" role="alert">
    <h1>演示入口无效</h1>
    <p>{{ entryError }}</p>
    <a href="http://localhost:5506/">返回工作台</a>
  </div>
  <div
    v-if="preview.enabled && !previewStatus.ready && !entryError"
    class="loading-feedback"
    role="status"
  >
    正在加载…
  </div>
  <Teleport to="body">
    <ScenicLoadingScreen
      v-if="modelLoading"
      :title="scenario.name"
      :theme="dark ? 'dark' : 'light'"
      :progress="modelProgress"
      label="空间加载进度"
      @complete="progressPainted = true"
    />
  </Teleport>
  <ContourBackground
    v-if="!entryError && (!preview.enabled || previewStatus.ready)"
    :theme="dark ? 'dark' : 'light'"
    :background-color="themeColors.canvas"
    :line-color="
      terminal === 'ops'
        ? themeColors.brand
        : dark
          ? '#fff'
          : scenario.theme.brand
    "
    :line-opacity="0.07"
    class="app-background"
    :data-loading="modelLoading"
    :inert="modelLoading"
    :aria-hidden="modelLoading ? true : undefined"
  >
    <div
      :class="[
        'app',
        terminal,
        {
          'has-rack': terminal === 'admin' && !locked,
          'scene-overview': sceneOverview,
        },
      ]"
    >
      <header v-if="!sceneOverview && terminal !== 'ops'" class="topbar">
        <a href="#/overview" class="brand" @click.prevent="go('overview')"
          ><span class="brand-mark"
            ><GraduationCap v-if="scenario.kind === 'campus'" /><Building2
              v-else /></span
          ><span
            ><strong>{{ scenario.name }}</strong
            ><small>{{ scenario.english }}</small></span
          ></a
        >
        <div class="topbar-center">
          <span class="live-dot" />{{ terminalLabel }}<span class="divider" />{{
            demo.context || preview.enabled
              ? "2026年10月9日"
              : "2026年9月25日 · 星期五"
          }}
        </div>
        <div class="topbar-actions">
          <PreviewTools
            v-if="preview.enabled || demo.context"
            :identity="state.identity || undefined"
            :error="previewStatus.error"
            :refresh="preview.enabled"
            :focus="terminal === 'public'"
            @refresh="previewClient?.refresh()"
            @focus="focusPreview"
          />
          <GlassButton
            :aria-label="dark ? '切换浅色' : '切换深色'"
            @click="dark = !dark"
            ><Sun v-if="dark" :size="18" /><Moon
              v-else
              :size="18" /></GlassButton
          ><GlassButton
            v-if="state.identity"
            aria-label="退出登录"
            @click="logout"
            ><LogOut :size="17" /></GlassButton
          ><GlassButton
            v-if="!locked && terminal !== 'preview'"
            class="menu-toggle"
            aria-label="打开导航"
            @click="menuOpen = !menuOpen"
            ><Menu :size="18"
          /></GlassButton>
        </div>
      </header>
      <div v-if="locked" class="login-layout">
        <section class="login-copy">
          <p class="eyebrow">{{ scenario.english }}</p>
          <h1>{{ scenario.tagline }}</h1>
          <p>{{ scenario.description }}</p>
          <div class="login-line" />
          <span>{{ scenario.name }} · {{ terminalLabel }}</span>
        </section>
        <GlassSurface class="login-card" :radius="24" :tint-opacity="0.6"
          ><p class="eyebrow">WELCOME BACK</p>
          <h2>{{ terminal === "admin" ? "管理中心" : "工作人员" }}登录</h2>
          <p class="muted">继续处理今天的每一件小事。</p>
          <form class="editor" @submit.prevent="login">
            <label
              >账号<input
                v-model="credentials.username"
                aria-label="账号"
                autocomplete="username" /></label
            ><label
              >密码<input
                v-model="credentials.password"
                aria-label="密码"
                type="password"
                autocomplete="current-password"
            /></label>
            <p v-if="loginError" class="error" role="alert">
              {{ loginError }}
            </p>
            <GlassButton class="primary" type="submit" :disabled="actionBusy"
              >进入工作台 <ArrowRight :size="17"
            /></GlassButton>
          </form>
          <p class="demo-account">
            演示账号 {{ terminal === "admin" ? "admin01" : "staff01" }} / 123456
          </p></GlassSurface
        >
      </div>
      <template v-else>
        <nav
          v-if="terminal !== 'preview' && terminal !== 'ops' && !sceneOverview"
          :class="['page-nav', { 'menu-open': menuOpen }]"
          aria-label="页面导航"
        >
          <button
            v-for="n in nav"
            :key="n.id"
            :class="{ active: page === n.id }"
            @click="go(n.id)"
          >
            {{ n.label }}
          </button>
        </nav>
        <RecordRackNav
          v-if="terminal === 'admin'"
          class="admin-rack"
          :items="scenario.navigation"
          :active-id="page"
          title="工作导航"
          :theme="rackTheme"
          @activate="go($event.itemId)"
        />
        <main>
          <section
            v-if="demo.context?.stage === 'template'"
            class="demo-template-note"
          >
            <h2>通用工单结构已就绪</h2>
            <p>待配置：场景名称、设施列表、字段映射与工单数据。</p>
          </section>
          <label
            v-if="
              (demo.context?.stage === 'campus-ready' ||
                (preview.enabled && terminal === 'staff')) &&
              ['overview', 'tasks', 'history'].includes(page)
            "
            class="demo-facility-filter"
            >设施筛选
            <select v-model="facilityFilter" aria-label="设施筛选">
              <option value="">全部设施</option>
              <option
                v-for="facility in preview.enabled
                  ? state.records.facilities
                  : C01.facilities"
                :key="facility.id"
                :value="facility.id"
              >
                {{ facility.title }} · {{ facility.id }}
              </option>
            </select>
          </label>
          <div v-if="spaceOnly" class="space-only">
            <ModelBrowser
              ref="mapRef"
              :intro="false"
              view="learning"
              :records="[
                ...state.records.facilities,
                ...state.records.buildings,
              ]"
              demo-associations
              @preparation-progress="modelProgress = $event"
              @intro-state="modelStateChanged"
              ><template #tools
                ><PreviewTools
                  v-if="preview.enabled || demo.context"
                  :identity="state.identity || undefined"
                  :error="previewStatus.error"
                  :refresh="preview.enabled"
                  :focus="terminal === 'public'"
                  @refresh="previewClient?.refresh()"
                  @focus="focusPreview" /></template
            ></ModelBrowser>
          </div>
          <template v-else-if="sceneOverview">
            <PublicStage
              :intro-ready="modelIntroState === 'ready' || modelFailed"
              :records="state.records"
              :figures="figures"
              :dark="dark"
              @theme="dark = !dark"
              @navigate="go"
            >
              <template #tools
                ><PreviewTools
                  v-if="preview.enabled || demo.context"
                  :identity="state.identity || undefined"
                  :error="previewStatus.error"
                  :refresh="preview.enabled"
                  :focus="terminal === 'public'"
                  @refresh="previewClient?.refresh()"
                  @focus="focusPreview"
              /></template>
              <template #default="{ view }">
                <ModelBrowser
                  ref="mapRef"
                  :demo-associations="!!demo.context || preview.enabled"
                  :intro="terminal === 'public'"
                  immersive
                  :view="view"
                  :dark="dark"
                  :records="[
                    ...state.records.facilities,
                    ...state.records.buildings,
                  ]"
                  @preparation-progress="modelProgress = $event"
                  @intro-state="modelStateChanged"
                />
              </template>
            </PublicStage>
          </template>
          <OperationsMonitor
            v-else-if="terminal === 'ops'"
            :records="state.records"
            :figures="figures"
            :dark="dark"
            :chart="chart"
            :usage-chart="usageChart"
            :chart-mode="chartMode"
            @theme="dark = !dark"
            @mode="chartMode = $event"
            ><template #tools
              ><PreviewTools
                v-if="preview.enabled || demo.context"
                :identity="state.identity || undefined"
                :error="previewStatus.error"
                :refresh="preview.enabled"
                :focus="false"
                @refresh="previewClient?.refresh()"
                @focus="focusPreview" /></template
          ></OperationsMonitor>
          <template v-else-if="page === 'overview' && terminal === 'admin'">
            <div class="section-heading">
              <div>
                <p class="eyebrow">YOUR DAILY WORKSPACE</p>
                <h1>早安，{{ state.identity }}。</h1>
                <p class="muted">每一件小事，都值得被认真对待。</p>
              </div>
              <span class="date-seal">09<small>SEPTEMBER / 25</small></span>
            </div>
            <div class="metric-grid">
              <GlassSurface
                v-for="f in figures"
                :key="f.label"
                class="metric"
                :radius="18"
                ><span>{{ f.label }}</span
                ><strong
                  >{{ f.value }}<small>{{ f.unit }}</small></strong
                >
                <p>{{ f.note }}</p></GlassSurface
              >
            </div>
            <section class="admin-overview">
              <GlassSurface class="work-panel" :radius="22"
                ><div class="panel-title">
                  <h2>待办事项</h2>
                  <button class="text-button" @click="go('tasks')">
                    查看全部 <ArrowUpRight :size="17" />
                  </button>
                </div>
                <button
                  v-for="item in activeTasks.slice(0, 5)"
                  :key="item.id"
                  class="work-row"
                  @click="
                    go(item.id.startsWith('I') ? 'inspections' : 'tasks');
                    select(item);
                  "
                >
                  <span class="task-icon"><Clock3 :size="20" /></span
                  ><span
                    ><strong>{{ item.title }}</strong
                    ><small
                      >{{ item.location }} · {{ item.category }}</small
                    ></span
                  ><StatusTag
                    :label="item.status"
                    tone="warning"
                  /><ArrowUpRight :size="18" /></button></GlassSurface
              ><GlassSurface class="work-panel" :radius="22"
                ><div class="panel-title">
                  <h2>公告速览</h2>
                  <button class="text-button" @click="go('notices')">
                    管理
                  </button>
                </div>
                <button
                  v-for="item in state.records.notices"
                  :key="item.id"
                  class="overview-notice"
                  @click="
                    go('notices');
                    select(item);
                  "
                >
                  <span class="eyebrow">{{ item.category }}</span>
                  <h3>{{ item.title }}</h3>
                  <p>{{ item.description }}</p>
                </button></GlassSurface
              >
            </section>
            <GlassSurface class="chart-panel" :radius="20"
              ><div class="panel-title">
                <h3>公共能耗</h3>
                <div class="segments">
                  <button
                    :class="{ active: chartMode === 'electricity' }"
                    @click="chartMode = 'electricity'"
                  >
                    用电</button
                  ><button
                    :class="{ active: chartMode === 'water' }"
                    @click="chartMode = 'water'"
                  >
                    用水
                  </button>
                </div>
              </div>
              <div class="chart">
                <ScenicChart :option="chart" label="公共能耗趋势" /></div
            ></GlassSurface>
          </template>
          <template v-else-if="page === 'overview' && terminal === 'staff'"
            ><section class="staff-welcome">
              <p class="eyebrow">EVERY DETAIL MATTERS</p>
              <h1>早安，{{ state.identity }}。</h1>
              <p>今天也一起，守护{{ scenario.location }}的美好。</p>
              <div class="staff-counts">
                <span
                  ><strong>{{
                    activeTasks.filter((r) => r.status === "待处理").length
                  }}</strong
                  >待领取</span
                ><span
                  ><strong>{{
                    activeTasks.filter((r) => r.status === "处理中").length
                  }}</strong
                  >处理中</span
                ><span
                  ><strong>{{
                    state.records.tasks.filter((r) => r.status === "已完成")
                      .length +
                    state.records.inspections.filter(
                      (r) => r.status === "已完成",
                    ).length
                  }}</strong
                  >已完成</span
                >
              </div>
            </section>
            <div class="panel-title">
              <h2>今日任务</h2>
              <span class="muted">按状态处理</span>
            </div>
            <RecordList
              :items="activeTasks"
              title="今日任务"
              cards
              @select="select"
          /></template>
          <template v-else-if="terminal === 'preview'"
            ><div class="section-heading">
              <div>
                <p class="eyebrow">THE INTERACTION COLLECTION</p>
                <h1>同一种手感，不同的日常。</h1>
                <p class="muted">原有组件、动效和场景替换入口。</p>
              </div>
            </div>
            <div class="preview-grid">
              <GlassSurface class="work-panel" :radius="22"
                ><h2>液态玻璃</h2>
                <p>保留 14px 圆角、2px 轻模糊与按压反馈。</p>
                <GlassButton @click="inform('玻璃交互已触发')"
                  >触摸一下 <ArrowUpRight :size="17" /></GlassButton
                ><GlassButton
                  class="primary"
                  @click="selected = state.records.facilities[0]"
                  >详情抽屉</GlassButton
                ></GlassSurface
              ><GlassSurface class="work-panel" :radius="22"
                ><h2>水墨进度</h2>
                <InkProgress :progress="68" />
                <h2>玻璃滚动条</h2>
                <ScrollArea style="height: 140px"
                  ><p v-for="i in 12" :key="i">
                    {{ String(i).padStart(2, "0") }} · {{ scenario.tagline }}
                  </p></ScrollArea
                ></GlassSurface
              >
            </div>
            <div class="preview-model">
              <ModelBrowser
                :dark="dark"
                intro
                @preparation-progress="modelProgress = $event"
                @intro-state="modelStateChanged"
              />
            </div>
            <RecordRackNav
              :items="scenario.navigation"
              :active-id="page"
              placement="right"
              :theme="rackTheme"
              @activate="
                page = $event.itemId;
                inform('唱片架选择：' + $event.itemId);
              "
          /></template>
          <template
            v-else-if="
              items.length ||
              nav.some((n) => n.id === page) ||
              (terminal === 'public' &&
                ['buildings', 'bookings'].includes(page))
            "
            ><div class="section-heading">
              <div>
                <p class="eyebrow">
                  {{
                    terminal === "staff"
                      ? "SERVICE & CARE"
                      : "SPACES · PEOPLE · EVERYDAY"
                  }}
                </p>
                <h1>{{ page === "history" ? "历史记录" : title }}</h1>
                <p class="muted">
                  {{
                    terminal === "public"
                      ? "发现身边的服务，让日常更从容。"
                      : "清晰掌握每一条记录，让服务有迹可循。"
                  }}
                </p>
              </div>
            </div>
            <RecordList
              :key="page"
              :items="items"
              :title="title"
              :cards="terminal === 'public' || terminal === 'staff'"
              :editable="terminal === 'admin'"
              @select="select"
              @create="
                creating = true;
                selected = null;
              "
          /></template>
          <div v-else class="empty">
            <h1>页面未找到</h1>
            <GlassButton @click="go('overview')">返回首页</GlassButton>
          </div>
        </main>
        <footer v-if="!sceneOverview && terminal !== 'ops'" class="app-footer">
          <span>{{ scenario.name }} · {{ terminalLabel }}</span
          ><span>用心连接每一处日常</span>
        </footer>
      </template>
    </div></ContourBackground
  >
  <Drawer
    v-if="!modelLoading && (selected || creating)"
    :title="
      creating ? '新增' + title : editing ? '编辑' + title : selected!.title
    "
    :subtitle="selected?.location"
    @close="
      selected = null;
      creating = false;
      editing = false;
    "
    ><p v-if="error" role="alert" class="error">{{ error }}</p>
    <Editor
      v-if="creating || editing"
      :item="selected ?? undefined"
      :collection="collection"
      :associations="preview.enabled ? (state.records as Records) : undefined"
      :busy="actionBusy"
      @save="save"
      @cancel="
        selected = null;
        creating = false;
        editing = false;
      "
    /><template v-else-if="selected"
      ><StatusTag :label="selected.status" tone="info" />
      <p class="detail-description">{{ selected.description }}</p>
      <dl class="detail-meta">
        <template v-if="demo.context && facilityFor(selected)"
          ><dt>设施 / 楼宇</dt>
          <dd>
            {{ facilityFor(selected)?.title }} ·
            {{ facilityFor(selected)?.id }} →
            {{ facilityFor(selected)?.buildingId }} 明理楼
          </dd></template
        >
        <template v-if="preview.enabled"
          ><dt>设施 / 楼宇</dt>
          <dd>
            {{ (selected as LinkedRecord).facilityId || "—" }} /
            {{ (selected as LinkedRecord).buildingId || "—" }}
          </dd>
          <dt>提交人 / 处理人</dt>
          <dd>
            {{ (selected as LinkedRecord).submitterId || "—" }} /
            {{ (selected as LinkedRecord).assigneeId || "—" }}
          </dd></template
        >
        <dt>位置</dt>
        <dd>{{ selected.location }}</dd>
        <dt>分类</dt>
        <dd>{{ selected.category }}</dd>
        <dt>日期</dt>
        <dd>{{ selected.date }}</dd>
        <template v-if="selected.contact"
          ><dt>联系电话</dt>
          <dd>{{ selected.contact }}</dd></template
        ><template v-if="selected.capacity"
          ><dt>总量 / 已使用</dt>
          <dd>{{ selected.capacity }} / {{ selected.used ?? 0 }}</dd></template
        ><template v-if="selected.owner"
          ><dt>负责人</dt>
          <dd>{{ selected.owner }}</dd></template
        >
      </dl>
      <div v-if="selected.result" class="result-note">
        <h3>处理结果</h3>
        <p>{{ selected.result }}</p>
      </div>
      <div v-if="terminal === 'staff'" class="editor">
        <GlassButton
          v-if="selected.status === '待处理'"
          class="primary"
          @click="claimTask"
          :disabled="actionBusy"
          >领取任务</GlassButton
        ><template v-else-if="selected.status === '处理中'"
          ><label
            >处理结果<textarea
              v-model="result"
              aria-label="处理结果"
              rows="4"
              placeholder="记录现场检查和处理情况"
            />
          </label>
          <GlassButton class="primary" :disabled="actionBusy" @click="finish"
            >提交处理结果 <Check :size="17" /></GlassButton
        ></template>
      </div>
      <GlassButton
        v-if="terminal === 'admin'"
        class="primary"
        @click="editing = true"
        >编辑记录</GlassButton
      ></template
    ></Drawer
  >
  <Transition name="toast"
    ><div v-if="toast && !modelLoading" class="toast" role="status">
      <Check :size="17" />{{ toast }}
    </div></Transition
  >
</template>

<style scoped>
.space-only {
  height: 100vh;
  min-height: 550px;
  width: 100%;
  position: relative;
}
.loading-feedback {
  padding: 24px;
  color: #65768b;
}
.demo-error {
  padding: 64px;
  font: 18px system-ui;
}
.demo-template-note {
  padding: 24px;
  border: 1px dashed #8c9ebf;
  border-radius: 18px;
  margin-bottom: 24px;
  background: #f5f7fb;
  color: #364968;
}
.demo-facility-filter {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}
.demo-facility-filter select {
  padding: 10px 18px;
  border: 1px solid #b6c3d8;
  border-radius: 10px;
  background: white;
  color: #263652;
}
</style>
