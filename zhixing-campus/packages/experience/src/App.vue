<script setup lang="ts">
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
} from "vue";
import { scenario } from "../../../scenario/config";
import {
  createState,
  metrics,
  createRecord,
  type Collection,
  type RecordItem,
} from "@scene/domain";
import {
  bookingStatusLabel,
  createBookingClient,
  type BookingRequest,
} from "@scene/bookings";
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
import TeacherWorkspace from "./components/TeacherWorkspace.vue";
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
const bookingClient = createBookingClient(import.meta.env.VITE_BOOKING_API_URL);
const sharedBookings = ref<BookingRequest[]>([]);
const bookingError = ref("");
const bookingsLoading = ref(false);

function bookingRecord(booking: BookingRequest): RecordItem {
  return {
    id: booking.id,
    title: `${booking.venue} · ${booking.owner}`,
    location: booking.venue,
    category: "教室预约",
    description: `${booking.date} ${booking.time}，${booking.count}人。${booking.purpose}`,
    status: bookingStatusLabel[booking.status],
    date: booking.date,
    owner: booking.owner,
    result: booking.reviewReason,
  };
}
async function refreshBookings() {
  if (terminal !== "admin" || !state.identity) return;
  bookingsLoading.value = true;
  bookingError.value = "";
  try {
    sharedBookings.value = await bookingClient.list();
    const updated = sharedBookings.value.find((item) => item.id === selected.value?.id);
    if (updated) selected.value = bookingRecord(updated);
  } catch (cause) {
    bookingError.value = cause instanceof Error ? cause.message : "预约申请加载失败";
  } finally {
    bookingsLoading.value = false;
  }
}
const selectedBooking = computed(() => sharedBookings.value.find((item) => item.id === selected.value?.id));
function currentPage() {
  if (terminal === "staff") {
    const requested = location.hash.slice(2) || "overview";
    if (["overview", "teaching", "approvals", "profile"].includes(requested)) return requested;
    history.replaceState(null, "", location.pathname + location.search + "#/overview");
    return "overview";
  }
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
    terminal === "preview" ||
    (terminal === "public" && page.value === "overview"),
);
const sceneOverview = computed(
  () => terminal === "public" && page.value === "overview",
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
        staff: "教学工作台",
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
            { id: "overview", label: "工作台" },
            { id: "teaching", label: "教学" },
            { id: "approvals", label: "审批" },
            { id: "profile", label: "我的" },
          ],
);
const figures = computed(() => metrics(state, scenario));
const items = computed(() =>
  page.value === "venues"
    ? state.records.facilities.filter((r) => r.capacity)
    : page.value === "bookings" && terminal === "admin"
      ? sharedBookings.value.map(bookingRecord)
    : page.value === "history"
      ? [...state.records.tasks, ...state.records.inspections].filter(
          (r) => r.status === "已完成",
        )
      : (state.records[collection.value] ?? []),
);
const activeTasks = computed(() =>
  [...state.records.tasks, ...state.records.inspections].filter(
    (r) => r.status !== "已完成",
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
function login() {
  if (
    credentials.username === (terminal === "admin" ? "admin01" : "staff01") &&
    credentials.password === "123456"
  ) {
    state.identity = terminal === "admin" ? "管理员" : "陈越";
    if (terminal === "staff") sessionStorage.setItem("zhixing:teacher-session", state.identity);
    loginError.value = "";
  } else loginError.value = "账号或密码不正确，请重新输入";
}
function logout() {
  state.identity = null;
  if (terminal === "staff") sessionStorage.removeItem("zhixing:teacher-session");
}
function select(item: RecordItem) {
  selected.value = item;
  editing.value = false;
  bookingError.value = "";
}
function save(input: Omit<RecordItem, "id">) {
  if (selected.value) Object.assign(selected.value, input);
  else createRecord(state, collection.value, input);
  selected.value = null;
  creating.value = false;
  editing.value = false;
  inform("已保存");
}
let stopScroll: (() => void) | undefined;
onMounted(() => {
  if (terminal === "staff" && sessionStorage.getItem("zhixing:teacher-session") === "陈越") state.identity = "陈越";
  window.addEventListener("hashchange", sync);
  stopScroll = installScrollbars();
});
watch([page, () => state.identity], () => {
  if (terminal === "admin" && state.identity && ["overview", "bookings"].includes(page.value))
    void refreshBookings();
}, { immediate: true });
onBeforeUnmount(() => {
  window.removeEventListener("hashchange", sync);
  stopScroll?.();
  clearTimeout(toastTimer);
});
</script>
<template>
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
            ><small>{{
              terminal === "staff" ? terminalLabel : scenario.english
            }}</small></span
          ></a
        >
        <div class="topbar-center">
          <span class="live-dot" />{{ terminalLabel
          }}<span class="divider" />{{ new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()) }}
        </div>
        <div class="topbar-actions">
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
            v-if="!locked && terminal !== 'preview' && terminal !== 'staff'"
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
          <h2>{{ terminal === "admin" ? "管理中心" : "教师工作台" }}登录</h2>
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
            <p v-if="loginError" class="error" role="alert">{{ loginError }}</p>
            <GlassButton class="primary" type="submit"
              >进入工作台 <ArrowRight :size="17"
            /></GlassButton>
          </form>
</GlassSurface
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
          <template v-if="sceneOverview">
            <PublicStage
              :intro-ready="modelIntroState === 'ready' || modelFailed"
              :records="state.records"
              :figures="figures"
              :dark="dark"
              @theme="dark = !dark"
              @navigate="go"
            >
              <template #default="{ view }">
                <ModelBrowser
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
          />
          <TeacherWorkspace v-else-if="terminal === 'staff'" :page="page" :identity="state.identity!" @navigate="go" />
          <template v-else-if="page === 'overview' && terminal === 'admin'">
            <div class="section-heading">
              <div>
                <p class="eyebrow">YOUR DAILY WORKSPACE</p>
                <h1>早安，{{ state.identity }}。</h1>
                <p class="muted">每一件小事，都值得被认真对待。</p>
                <button class="text-button" @click="go('bookings')">查看教室预约记录 {{ sharedBookings.length }} 条（教师终审） <ArrowUpRight :size="17" /></button>
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
                  SPACES · PEOPLE · EVERYDAY
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
            <div v-if="terminal === 'admin' && page === 'bookings'" class="booking-toolbar">
              <p>仅供查阅。教室预约由带班教师终审，学生端可查看结果。</p>
              <GlassButton :disabled="bookingsLoading" @click="refreshBookings">{{ bookingsLoading ? '正在刷新…' : '刷新申请' }}</GlassButton>
            </div>
            <p v-if="terminal === 'admin' && page === 'bookings' && bookingError" class="error" role="alert">{{ bookingError }}</p>
            <RecordList
              :key="page"
              :items="items"
              :title="title"
              :cards="terminal === 'public'"
              :editable="terminal === 'admin' && page !== 'bookings'"
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
    :mobile-page="terminal === 'staff'"
    :title="
      creating ? '新增' + title : editing ? '编辑' + title : selected!.title
    "
    :subtitle="selected?.location"
    @close="
      selected = null;
      creating = false;
      editing = false;
    "
    ><Editor
      v-if="creating || editing"
      :item="selected ?? undefined"
      :collection="collection"
      @save="save"
      @cancel="
        selected = null;
        creating = false;
        editing = false;
      "
    /><template v-else-if="selected"
      ><StatusTag :label="selected.status" :tone="selected.status === '待审核' ? 'warning' : selected.status === '已预约' ? 'success' : selected.status === '已拒绝' ? 'danger' : 'info'" />
      <p class="detail-description">{{ selected.description }}</p>
      <dl class="detail-meta">
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
        <h3>{{ selectedBooking ? '审核说明' : '处理结果' }}</h3>
        <p>{{ selected.result }}</p>
      </div>
      <template v-if="terminal === 'admin' && selectedBooking">
        <dl class="detail-meta">
          <dt>申请人</dt><dd>{{ selectedBooking.owner }}</dd>
          <dt>时段</dt><dd>{{ selectedBooking.time }}</dd>
          <dt>人数</dt><dd>{{ selectedBooking.count }} 人</dd>
          <dt>活动名称</dt><dd>{{ selectedBooking.activity || '旧版未填写' }}</dd>
          <dt>使用用途</dt><dd>{{ selectedBooking.purpose }}</dd>
          <dt>联系电话</dt><dd>{{ selectedBooking.phone || '旧版未填写' }}</dd>
          <dt>补充说明</dt><dd>{{ selectedBooking.note || '无' }}</dd>
          <template v-if="selectedBooking.reviewer"><dt>审核人</dt><dd>{{ selectedBooking.reviewer }}</dd></template>
        </dl>

      </template>
      <GlassButton
        v-if="terminal === 'admin' && page !== 'bookings'"
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
