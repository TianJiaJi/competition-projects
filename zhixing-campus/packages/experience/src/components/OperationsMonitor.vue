<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";
import type { Collection, Metric, RecordItem } from "@scene/domain";
import {
  LiquidGlassSurface as GlassSurface,
  LiquidGlassButton as GlassButton,
} from "@scene/ui/liquid-glass";
import { ScenicChart } from "@scene/ui/charts";
import { ScenicLoadingScreen } from "@scene/ui/progress";
import {
  Activity,
  ArrowUpRight,
  Building2,
  GraduationCap,
  Clock3,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-vue-next";
import { scenario } from "../../../../scenario/config";
import StatusTag from "./StatusTag.vue";
import "./operations-monitor.css";
type ChartOption = InstanceType<typeof ScenicChart>["$props"]["option"];
const props = defineProps<{
  records: Record<Collection, RecordItem[]>;
  figures: Metric[];
  dark: boolean;
  chart: ChartOption;
  usageChart: ChartOption;
  chartMode: "electricity" | "water";
}>();
const emit = defineEmits<{
  theme: [];
  mode: [mode: "electricity" | "water"];
}>();
const mapFailed = ref(false),
  mapReady = ref(false),
  mapProgress = ref(0);
const ModelBrowser = defineAsyncComponent({
  loader: () => import("./ModelBrowser.vue"),
  errorComponent: { render: () => null },
  onError(_error, _retry, fail) {
    mapFailed.value = true;
    fail();
  },
});
const fontsReady = ref(false),
  chartsReady = ref(new Set<string>());
const phase = ref<"preparing" | "entering" | "ready">("preparing");
const prepared = computed(
  () =>
    fontsReady.value &&
    chartsReady.value.size === 2 &&
    (mapReady.value || mapFailed.value),
);
const progress = computed(() =>
  prepared.value
    ? 100
    : Math.min(
        95,
        (fontsReady.value ? 10 : 0) +
          chartsReady.value.size * 10 +
          mapProgress.value * 0.65,
      ),
);
let entryTimer: ReturnType<typeof setTimeout> | undefined;
let ticker: ReturnType<typeof setInterval> | undefined;
let disposed = false;
function startEntry() {
  if (!prepared.value || phase.value !== "preparing") return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches)
    phase.value = "ready";
  else {
    phase.value = "entering";
    entryTimer = setTimeout(() => {
      phase.value = "ready";
    }, 2250);
  }
}
function modelState(state: string) {
  if (state === "failed") mapFailed.value = true;
  if (state === "ready") mapReady.value = true;
}
const now = ref(new Date());
const date = computed(() =>
  now.value.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }),
);
const time = computed(() =>
  now.value.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }),
);
const adminUrl = new URL(location.href);
adminUrl.port = String(scenario.ports.admin);
adminUrl.pathname = "/";
adminUrl.search = "";
adminUrl.hash = "/overview";
const activeTasks = computed(() =>
  props.records.tasks.filter((item) => item.status !== "已完成"),
);
const normalCount = computed(
  () =>
    props.records.facilities.filter((item) => item.status === "正常").length,
);
const abnormal = computed(() =>
  props.records.facilities.filter((item) => item.status !== "正常"),
);
const facilitySummary = computed(() =>
  [
    ...abnormal.value,
    ...props.records.facilities.filter((item) => item.status === "正常"),
  ].slice(0, 4),
);
onMounted(async () => {
  ticker = setInterval(() => {
    now.value = new Date();
  }, 30000);
  await document.fonts.ready;
  if (!disposed) fontsReady.value = true;
});
onBeforeUnmount(() => {
  disposed = true;
  clearInterval(ticker);
  clearTimeout(entryTimer);
});
</script>
<template>
  <section
    class="community-monitor"
    :data-entry-state="phase"
    :aria-label="scenario.screens.monitorTitle"
  >
    <Teleport to="body">
      <ScenicLoadingScreen
        v-if="phase === 'preparing'"
        :title="scenario.name"
        :theme="dark ? 'dark' : 'light'"
        :progress="progress"
        label="运行监控加载进度"
        :message="'正在准备' + scenario.location + '沙盘与监控图表'"
        @complete="startEntry"
      />
    </Teleport>
    <div
      class="monitor-content"
      :inert="phase !== 'ready'"
      :aria-hidden="phase === 'preparing' ? true : undefined"
    >
      <header class="monitor-masthead">
        <div class="monitor-state">
          <span><i class="live-dot" />{{ scenario.screens.monitorTitle }}</span
          ><small>{{ scenario.screens.motto }}</small>
        </div>
        <div class="monitor-brand">
          <component
            :is="scenario.kind === 'campus' ? GraduationCap : Building2"
            :size="27"
            :stroke-width="1.3"
          />
          <div>
            <h1>{{ scenario.name }}</h1>
            <p>{{ scenario.english }}</p>
          </div>
        </div>
        <div class="monitor-actions">
          <div class="monitor-clock">
            <strong>{{ time }}</strong
            ><small>{{ date }}</small>
          </div>
          <a
            class="monitor-admin"
            :href="adminUrl.href"
            target="_blank"
            rel="noopener noreferrer"
            >管理中心<ArrowUpRight :size="14" /></a
          ><GlassButton
            :aria-label="dark ? '切换浅色' : '切换深色'"
            @click="emit('theme')"
            ><Sun v-if="dark" :size="18" /><Moon v-else :size="18"
          /></GlassButton>
        </div>
      </header>
      <div class="monitor-metrics">
        <GlassSurface
          v-for="(figure, index) in figures"
          :key="figure.label"
          class="monitor-metric"
          :radius="18"
          :style="{ '--entry-delay': `${80 + index * 60}ms` }"
          ><div>
            <span>{{ figure.label }}</span
            ><small>{{ String(index + 1).padStart(2, "0") }}</small>
          </div>
          <strong
            >{{ figure.value }}<small>{{ figure.unit }}</small></strong
          >
          <p>{{ figure.note }}</p></GlassSurface
        >
      </div>
      <div class="monitor-grid">
        <aside class="monitor-left">
          <GlassSurface class="monitor-panel monitor-security" :radius="20"
            ><header>
              <div>
                <p class="monitor-kicker">SECURITY WATCH</p>
                <h2>安防</h2>
              </div>
              <ShieldCheck :size="20" />
            </header>
            <div class="monitor-summary">
              <strong>{{ records.security.length }}<small>条</small></strong
              ><span>当前事件记录</span>
            </div>
            <div class="monitor-rows">
              <div
                v-for="item in records.security.slice(0, 3)"
                :key="item.id"
                class="monitor-row"
              >
                <div>
                  <strong>{{ item.title }}</strong
                  ><StatusTag
                    :label="item.status"
                    :tone="item.status === '正常' ? 'success' : 'warning'"
                  />
                </div>
                <p>{{ item.location }} · {{ item.category }}</p>
              </div>
              <p v-if="!records.security.length" class="monitor-empty">
                暂无安防事件
              </p>
            </div></GlassSurface
          >
          <GlassSurface class="monitor-panel monitor-tasks" :radius="20"
            ><header>
              <div>
                <p class="monitor-kicker">SERVICE PROGRESS</p>
                <h2>服务工单</h2>
              </div>
              <Clock3 :size="20" />
            </header>
            <div class="monitor-summary">
              <strong>{{ activeTasks.length }}<small>项</small></strong
              ><span>待处理与处理中</span>
            </div>
            <div class="monitor-rows">
              <div
                v-for="item in activeTasks.slice(0, 3)"
                :key="item.id"
                class="monitor-row"
              >
                <div>
                  <strong>{{ item.title }}</strong
                  ><StatusTag :label="item.status" tone="info" />
                </div>
                <p>{{ item.location }}</p>
              </div>
              <p v-if="!activeTasks.length" class="monitor-empty">
                当前工单已全部完成
              </p>
            </div></GlassSurface
          >
        </aside>
        <div class="monitor-charts">
          <GlassSurface class="monitor-panel monitor-energy" :radius="20"
            ><header>
              <div>
                <p class="monitor-kicker">ENERGY TREND</p>
                <h2>公共能耗趋势</h2>
              </div>
              <div class="monitor-segments">
                <button
                  :class="{ active: chartMode === 'electricity' }"
                  :aria-pressed="chartMode === 'electricity'"
                  @click="emit('mode', 'electricity')"
                >
                  用电</button
                ><button
                  :class="{ active: chartMode === 'water' }"
                  :aria-pressed="chartMode === 'water'"
                  @click="emit('mode', 'water')"
                >
                  用水
                </button>
              </div>
            </header>
            <div class="monitor-chart">
              <ScenicChart
                :option="chart"
                label="公共能耗趋势"
                @ready="chartsReady.add('energy')"
              /></div
          ></GlassSurface>
          <GlassSurface class="monitor-panel monitor-parking" :radius="20"
            ><header>
              <div>
                <p class="monitor-kicker">USAGE TREND</p>
                <h2>{{ scenario.screens.usageTitle }}</h2>
              </div>
              <span class="monitor-unit">今日 · %</span>
            </header>
            <div class="monitor-chart">
              <ScenicChart
                :option="usageChart"
                :label="scenario.screens.usageTitle"
                @ready="chartsReady.add('parking')"
              /></div
          ></GlassSurface>
        </div>
        <aside class="monitor-right">
          <GlassSurface class="monitor-panel monitor-health" :radius="20"
            ><header>
              <div>
                <p class="monitor-kicker">EQUIPMENT HEALTH</p>
                <h2>设备运行</h2>
              </div>
              <Activity :size="20" />
            </header>
            <div
              class="monitor-health-ring"
              :style="{ '--health': `${Number(figures[3]?.value) || 0}%` }"
            >
              <div>
                <strong>{{ figures[3]?.value }}<small>%</small></strong
                ><span>设备在线率</span>
              </div>
            </div>
            <div class="monitor-health-counts">
              <div>
                <strong>{{ normalCount }}</strong
                ><span>正常运行</span>
              </div>
              <div>
                <strong>{{ abnormal.length }}</strong
                ><span>需要关注</span>
              </div>
            </div></GlassSurface
          >
          <GlassSurface class="monitor-panel monitor-facilities" :radius="20"
            ><header>
              <div>
                <p class="monitor-kicker">FACILITY STATUS</p>
                <h2>设施状态</h2>
              </div>
              <span class="monitor-unit"
                >{{ records.facilities.length }} 处</span
              >
            </header>
            <div class="monitor-rows">
              <div
                v-for="item in facilitySummary"
                :key="item.id"
                class="monitor-row"
              >
                <div>
                  <strong>{{ item.title }}</strong
                  ><StatusTag
                    :label="item.status"
                    :tone="item.status === '正常' ? 'success' : 'warning'"
                  />
                </div>
                <p>{{ item.location }}</p>
              </div>
              <p v-if="!records.facilities.length" class="monitor-empty">
                暂无设施记录
              </p>
            </div>
            <p class="monitor-footnote">
              完整记录与业务管理请前往管理中心
            </p></GlassSurface
          >
        </aside>
        <div class="monitor-model" :aria-label="scenario.name + '空间沙盘'">
          <div class="monitor-map-caption">
            <p class="monitor-kicker">SPACE OVERVIEW</p>
            <h2>{{ scenario.screens.spaceTitle }}全景</h2>
          </div>
          <div v-if="mapFailed" class="monitor-map-error" role="alert">
            沙盘加载失败，请刷新重试
          </div>
          <ModelBrowser
            :dark="dark"
            v-else
            :intro="false"
            screen-framing
            @preparation-progress="mapProgress = Math.max(mapProgress, $event)"
            @intro-state="modelState"
          />
        </div>
      </div>
    </div>
  </section>
</template>
