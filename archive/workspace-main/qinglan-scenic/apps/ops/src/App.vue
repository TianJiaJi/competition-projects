<script setup lang="ts">
import {layoutViewport,DISPLAY_CHANGE} from "@scenic/ui/display";
import {formatNumber} from "../../../packages/client/src/format-number";
import { ScenicLogo } from "@scenic/ui/scenic-art";
import {
  computed,
  nextTick,
  ref,
  shallowRef,
  watch,
  onMounted,
  onBeforeUnmount,
} from "vue";
import {
  Mountain,
  CloudSun,
  Users,
  ArrowDownToLine,
  CircleParking,
  Bell,
  Wind,
  Droplets,
  Thermometer,
  Leaf,
  Sparkles,
  Plus,
  Minus,
  RotateCcw,
  Pause,
  Play,
  ChevronRight,
  Clock3,
  Check,
  Activity,
  Accessibility,
  CableCar,
  HeartPulse,
  Wrench,
  Brush,
  ClipboardCheck,
  MessageCircle,
  History,
  LocateFixed,
  X,
  Filter,
  Radio,
} from "lucide-vue-next";
import { ContourBackground } from "@scenic/ui/contour";
import { LiquidGlassSurface, LiquidGlassButton } from "@scenic/ui/liquid-glass";
import ScenicBubble from "@scenic/ui/scenic/ScenicBubble.vue";
import { ScenicLoadingScreen } from "@scenic/ui/progress";
import EmergencyAtmosphere from "./EmergencyAtmosphere.vue";
import OpsDisposition from "./OpsDisposition.vue";
import { observedTrend, trendMaximum, shanghaiClock } from "./trend";
import {summarizeAlerts} from "./alert-stats";
import type ScenicMap from "@scenic/ui/scenic/ScenicMap.vue";
import {
  ScenicChart,
  getChartTheme,
  type EChartsOption,
} from "@scenic/ui/charts";
import { regions, points, pointById, safetyStatus, regionPressure, regionPressureDetail, pressureGradient, pressureLegendDescription, pressureNote } from "@scenic/scenic";
import type {
  OpsAlert,
  OpsAlertCategory,
  OpsAlertStatus,
  OpsSeverity,
} from "@scenic/contracts";
import {
  severityLabels,
  statusLabels,
  categoryLabels,
  sortAlerts,
  groupAlerts,
} from "./presentation";
import {emptySnapshot} from '../../../packages/contracts/src/empty-snapshot';
import type {OpsPrototypeSnapshot} from '@scenic/contracts';
import { createPlatformClient } from "../../../packages/client/src/platform";
import type { PlatformSnapshot } from "../../../packages/contracts/src/platform";
const api = createPlatformClient("ops");
const liveReady = ref(false), liveError=ref("");
let refreshGeneration=0;
let stopLive: (()=>void)|undefined;
async function refreshLive(){const generation=++refreshGeneration;try{await api.runtime();const result=await api.request<PlatformSnapshot>("/screens/ops");if(generation!==refreshGeneration||result.run.id!==api.runId)return;data.value={id:result.run.id,label:result.run.scenario,businessTime:result.run.businessTime,public:result.public,checkedInToday:result.checkedInToday,exitedToday:result.exitedToday,windSpeedMps:result.windSpeedMps,history:result.history,alerts:result.alerts,events:result.alerts.flatMap(a=>a.records.map((r,i)=>({id:a.id+"-"+i,alertId:a.id,at:r.at,kind:r.kind,title:a.title,text:r.actor+"："+r.text,severity:a.severity})))};liveReady.value=true;liveError.value="";}catch(e){if(generation!==refreshGeneration)return;liveReady.value=false;liveError.value=(e as Error).message;}}
onMounted(()=>{void refreshLive();stopLive=api.subscribe(()=>void refreshLive());});
onBeforeUnmount(()=>stopLive?.());
const theme = ref<"dark" | "light">("dark");
const chartTheme = computed(() => getChartTheme(theme.value));
const data = shallowRef<OpsPrototypeSnapshot>({id:'',label:'',businessTime:new Date(0).toISOString(),public:emptySnapshot(points.map(p=>p.id),regions.map(r=>r.id)),checkedInToday:0,windSpeedMps:0,history:[],alerts:[],events:[]});
const snapshot = computed(() => data.value.public);
const fmt = formatNumber;
const clock = shanghaiClock;
const severity = ref<OpsSeverity | "">(""),
  category = ref<OpsAlertCategory | "">(""),
  status = ref<Exclude<OpsAlertStatus, "resolved"> | "">("");
const historyOpen = ref(false),
  selectedId = ref<string | null>(null),
  focusedRegion = ref<string | null>(null);
const active = computed(() =>
  sortAlerts(data.value.alerts.filter((a) => a.status !== "resolved")),
);
const resolved = computed(() =>
  data.value.alerts
    .filter((a) => a.status === "resolved")
    .sort((a, b) => b.records.at(-1)!.at.localeCompare(a.records.at(-1)!.at)),
);
const visible = computed(() =>
  (historyOpen.value ? resolved.value : active.value).filter(
    (a) =>
      (!severity.value || a.severity === severity.value) &&
      (!category.value || a.category === category.value) &&
      (!status.value || a.status === status.value),
  ),
);
const mapAlerts = computed(() =>
  historyOpen.value
    ? active.value.filter(
        (a) =>
          (!severity.value || a.severity === severity.value) &&
          (!category.value || a.category === category.value),
      )
    : visible.value,
);
const groups = computed(() => groupAlerts(mapAlerts.value));
const selected = computed(() =>
  data.value.alerts.find((a) => a.id === selectedId.value),
);
const siblings = computed(() =>
  selected.value
    ? data.value.alerts.filter(
        (a) =>
          a.anchorId === selected.value!.anchorId &&
          (selected.value!.status === "resolved"
            ? a.status === "resolved"
            : a.status !== "resolved"),
      )
    : [],
);
const map = ref<InstanceType<typeof ScenicMap>>();
const projections = shallowRef<
  Record<string, { x: number; y: number; visible: boolean }>
>({});
const rotating = ref(true),
  mapReady = ref(false),
  mapFailed = ref(false);
const MapComponent = shallowRef<typeof ScenicMap>();
const entryStarted = ref(false),
  entryFinished = ref(false);
let entryTimer: ReturnType<typeof setTimeout> | undefined;
function startEntry() {
  if (entryStarted.value) return;
  entryStarted.value = true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    entryFinished.value = true;
  else entryTimer = setTimeout(() => (entryFinished.value = true), 2250);
}
const readyCharts = new Set<string>();
function maybeComplete() {
  if ((mapReady.value || mapFailed.value) && readyCharts.size === 4)
    preparation.value = 100;
}
function onChartReady(id: string) {
  readyCharts.add(id);
  maybeComplete();
}
function onPreparationProgress(value: number) {
  preparation.value = Math.max(
    preparation.value,
    Math.min(95, 45 + value * 0.5),
  );
}
const preparation = ref(0),
  mountMap = ref(false),
  prepareError = ref(false);
let disposed = false;
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(entryTimer);
});
const paint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
async function prepareMap() {
  prepareError.value = false;
  preparation.value = 20;
  await nextTick();
  await paint();
  try {
    await document.fonts.ready;
    if (disposed) return;
    preparation.value = 35;
    await nextTick();
    await paint();
    const module = await import("@scenic/ui/scenic/ScenicMap.vue");
    if (disposed) return;
    MapComponent.value = module.default;
    preparation.value = 45;
    mountMap.value = true;
  } catch {
    if (!disposed) {
      prepareError.value = true;
      startEntry();
    }
  }
}
function onMapState(state: string) {
  mapReady.value = state === "ready";
  mapFailed.value = state === "failed";
  maybeComplete();
}
onMounted(prepareMap);
const icons = {
  crowd: Users,
  parking: CircleParking,
  cable: CableCar,
  restroom: Accessibility,
  equipment: Wrench,
  help: HeartPulse,
  cleaning: Brush,
  inspection: ClipboardCheck,
};
const stateIcon = { pending: Clock3, processing: Activity, resolved: Check };
const mapArea=ref<HTMLElement>();
const focusExpanded=ref(false),feedDocked=ref(false),feedMoving=ref(false);
let feedDockTimer:ReturnType<typeof setTimeout>|undefined;
let focusLayoutTimer:ReturnType<typeof setTimeout>|undefined,focusRevision=0;
watch(()=>!!selected.value,(focused)=>{
  clearTimeout(focusLayoutTimer);const revision=++focusRevision;
  clearTimeout(feedDockTimer);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  focusExpanded.value=focused;
  feedMoving.value=!reduced;
  const dock=()=>{feedDocked.value=focused;feedMoving.value=false;};
  if(reduced)dock();else feedDockTimer=setTimeout(dock,260);
  if(!focused)map.value?.restoreFocus();
  const settle=()=>{
    if(revision!==focusRevision)return;
    if(selected.value)map.value?.focus(selected.value.anchorId);
  };
  if(reduced)void nextTick(settle);else focusLayoutTimer=setTimeout(settle,460);
});
onBeforeUnmount(()=>{clearTimeout(focusLayoutTimer);clearTimeout(feedDockTimer);focusRevision++;});
const viewportWidth=ref(layoutViewport().width);
const resizeViewport=()=>viewportWidth.value=layoutViewport().width;
onMounted(()=>{window.addEventListener('resize',resizeViewport);window.addEventListener(DISPLAY_CHANGE,resizeViewport);});
onBeforeUnmount(()=>{window.removeEventListener('resize',resizeViewport);window.removeEventListener(DISPLAY_CHANGE,resizeViewport);});
const detailInsets={top:32,right:32,bottom:32,left:32};
const regionLabels=computed(()=>regions.map(r=>({regionId:r.id,title:r.name,value:snapshot.value.regions[r.id].availability==='closed'?'未开放':`约 ${fmt(snapshot.value.regions[r.id].count!)} 人`})));
const alertStats=computed(()=>summarizeAlerts(data.value.alerts,data.value.businessTime));
const selectedAnchor = computed(() =>
  selected.value ? projections.value[selected.value.anchorId] : undefined,
);
const detailAnchor = computed(() =>
  selectedAnchor.value?.visible
    ? selectedAnchor.value
    : { x: 180, y: 140, visible: true },
);
function focusAlert(a: OpsAlert) {
  selectedId.value = a.id;
  focusedRegion.value = null;
  if(focusExpanded.value)map.value?.focus(a.anchorId);
}
function closeDetail() {
  const wasDetail=!!selected.value;
  selectedId.value = null;
  focusedRegion.value = null;
  if(!wasDetail)map.value?.restoreFocus();
}
function focusRegion(id: string) {
  selectedId.value = null;
  focusedRegion.value = id;
  map.value?.focus(`region-${id}`);
}
function reset() {
  selectedId.value = null;
  focusedRegion.value = null;
  map.value?.reset();
}
function clearFilters() {
  severity.value = "";
  category.value = "";
  status.value = "";
}
watch(mapReady, (ready) => {
  if (ready && selected.value) map.value?.focus(selected.value.anchorId);
});
watch([severity, category, status, historyOpen], () => {
  if (selected.value) closeDetail();
});
function changeHistory() {
  historyOpen.value = !historyOpen.value;
  status.value = "";
}
const feed = ref<HTMLElement>(),
  newCount = ref(0),
  highlightIds = ref<string[]>([]);
watch(()=>data.value.id, () => closeDetail());
watch(()=>data.value.events, async (events,previousEvents) => {
  const atTop = !feed.value || feed.value.scrollTop < 10,
    oldHeight = feed.value?.scrollHeight ?? 0,
    oldTop = feed.value?.scrollTop ?? 0;
  const previous = new Set(previousEvents.map((e) => e.id));
  if (selectedId.value && !selected.value) closeDetail();
  highlightIds.value = data.value.events
    .filter((e) => !previous.has(e.id))
    .map((e) => e.id);
  await nextTick();
  if (feed.value) {
    if (atTop) {
      feed.value.scrollTop = 0;
      newCount.value = 0;
    } else {
      feed.value.scrollTop =
        oldTop + Math.max(0, feed.value.scrollHeight - oldHeight);
      newCount.value = highlightIds.value.length;
    }
  }
});
function latest() {
  feed.value?.scrollTo({ top: 0, behavior: "smooth" });
  newCount.value = 0;
}
const rows = computed(() =>
  regions
    .map((r) => ({
      ...r,
      count: snapshot.value.regions[r.id].count!,
      available: snapshot.value.regions[r.id].availability,
      ratio: regionPressure(snapshot.value,r.id).ratio ?? 0,
      pressure: regionPressure(snapshot.value,r.id),
    }))
    .sort((a, b) => b.ratio - a.ratio),
);
const trendPoints = computed(() => observedTrend(data.value.history, data.value.businessTime, snapshot.value.visitors || 0));
const trendOption = computed<EChartsOption>(() => ({
  animation: false,
  textStyle: chartTheme.value.text,
  grid: { left: 8, right: 24, top: 12, bottom: 8, containLabel: true },
  tooltip: {
    ...chartTheme.value.tooltip,
    trigger: "axis",
    valueFormatter: (value) => `${fmt(Number(value))} 人`,
  },
  xAxis: {
    type: "category",
    boundaryGap: false,
    data: trendPoints.value.map((p) => clock(p.time)),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: chartTheme.value.colors.muted, fontSize: 11, hideOverlap: true, showMinLabel: true, showMaxLabel: true, margin: 10 },
  },
  yAxis: {
    type: "value",
    max: trendMaximum(trendPoints.value),
    splitNumber: 3,
    min: 0,
    axisLabel: {
      color: chartTheme.value.colors.muted,
      fontSize: 11,
      formatter: (value: number) => (value === 0 ? "0" : `${value / 1000}k`),
    },
    splitLine: chartTheme.value.gridLine,
  },
  series: [
    {
      type: "line",
      data: trendPoints.value.map((p) => p.count),
      smooth: 0.25,
      symbol: "circle",
      symbolSize: 5,
      itemStyle: { color: chartTheme.value.colors.brand },
      lineStyle: { width: 2.5 },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: `${chartTheme.value.colors.green}36` },
            { offset: 1, color: `${chartTheme.value.colors.green}00` },
          ],
        },
      },
    },
  ],
}));
const regionOption = computed<EChartsOption>(() => ({
  animation: false,
  textStyle: chartTheme.value.text,
  grid: { left: 105, right: 14, top: 6, bottom: 4 },
  xAxis: { type: "value", max: Math.max(1, ...rows.value.map(r=>r.ratio)), show: false },
  yAxis: {
    type: "category",
    inverse: true,
    data: rows.value.map((r) => r.name),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      interval: 0,
      fontSize: 13,
      color: chartTheme.value.ink,
      width: 98,
      overflow: "truncate",
    },
  },
  tooltip: {
    ...chartTheme.value.tooltip,
    trigger: "item",
    formatter: (params: any) => {
      const r = rows.value[params.dataIndex];
      return `${r.name}<br/>${regionPressureDetail(snapshot.value,r.id)}`;
    },
  },
  series: [
    {
      type: "bar",
      barWidth: 6,
      showBackground: true,
      backgroundStyle: { color: `${chartTheme.value.colors.grid}77`, borderRadius: 4 },
      data: rows.value.map((r) => ({
        value: r.ratio,
        itemStyle: {
          color: r.pressure.color,
          borderRadius: 4,
        },
      })),
    },
  ],
}));
const parking = computed(() =>
  points
    .filter((p) => p.kind === "parking")
    .map((p) => ({ ...p, ...snapshot.value.points[p.id] })),
);
const toilets = computed(() =>
  points
    .filter((p) => p.kind === "toilet")
    .map((p) => ({ ...p, ...snapshot.value.points[p.id] })),
);
const busiest = computed(
  () =>
    [...toilets.value]
      .filter((p) => p.availability === "open")
      .sort(
        (a, b) =>
          (b.restroom?.queueCount ?? 0) - (a.restroom?.queueCount ?? 0) ||
          b.restroom!.occupiedStalls! / b.restroom!.totalStalls! -
            a.restroom!.occupiedStalls! / a.restroom!.totalStalls!,
      )[0],
);
const env = computed(() => [
  {
    icon: Thermometer,
    label: "温度",
    value: formatNumber(snapshot.value.weather.temperature),
    unit: "°C",
  },
  {
    icon: Droplets,
    label: "湿度",
    value: String(snapshot.value.weather.humidity),
    unit: "%",
  },
  {
    icon: Wind,
    label: snapshot.value.weather.wind,
    value: formatNumber(data.value.windSpeedMps),
    unit: "m/s",
  },
  {
    icon: Leaf,
    label: "AQI · 优",
    value: String(snapshot.value.weather.aqi),
    unit: "",
  },
  {
    icon: Sparkles,
    label: "负氧离子",
    value: fmt(snapshot.value.weather.ions!),
    unit: "个/cm³",
  },
]);
const alertCounts = computed(() => ({
  critical: active.value.filter((a) => a.severity === "critical").length,
  processing: active.value.filter((a) => a.status === "processing").length,
}));
</script>

<template>
  <div v-if="!liveReady" class="ops-live-login"><h1>青岚山境 · 运行监控</h1><p>{{liveError || '正在连接景区数据…'}}</p><button @click="refreshLive">重新连接</button></div>
  <main v-if="liveReady"
    class="ops-screen"
    :data-theme="theme"
    :class="{ 'is-entered': entryStarted, 'is-entering': entryStarted && !entryFinished, 'is-focused': !!selected, 'focus-expanded': focusExpanded, 'feed-docked': feedDocked, 'feed-moving': feedMoving }"
    :data-entry-state="
      entryFinished ? 'ready' : entryStarted ? 'entering' : 'preparing'
    "
    @keydown.esc="closeDetail"
  >
    <ContourBackground
      class="contours"
      :background-color="theme === 'dark' ? '#101F22' : '#eaf3ef'"
      :line-color="theme === 'dark' ? '#83CBB6' : '#175f54'"
      :line-opacity="0.06"
    />
    <header class="masthead" :inert="!!selected"><div class="header-park-state"><span class="open-status"><i />{{snapshot.parkOpen?"景区开放中":snapshot.visitors?"停止入园 · 正在清园":"景区已闭园"}}</span><small>山水有序，守护每一程</small></div>
      <div class="brand">
        <div class="brand-mark">
          <ScenicLogo :size="40" decorative />
        </div>
        <div>
          <h1>青岚山境 <span>· 运行监控</span></h1>
          
        </div>
      </div>
      <div class="header-information"><div class="header-status">
        <span><CloudSun :size="19" />{{snapshot.weather.label}}</span
        ><time
          >{{ data.businessTime.slice(0, 10).replaceAll("-", ".") }}
          <strong>{{ clock(data.businessTime) }}</strong></time
        >
      </div>
      <div class="header-meta"><span><i /> {{ clock(data.businessTime) }} 更新</span></div>
      </div>
    </header>
    <section :inert="!!selected" class="metrics" aria-label="核心运营指标">
      <LiquidGlassSurface class="metric" :tint-opacity="0.19"
        ><div class="metric-label">
          <Users :size="18" />实时在园 <span>人</span>
        </div>
        <div class="metric-value" data-testid="in-park">
          {{ fmt(snapshot.visitors!) }}
        </div>
        <p>
          <span class="tiny-dot green" />全园承载率
          {{ ((snapshot.visitors! / 10000) * 100).toFixed(2) }}%<span
            class="metric-note"
            >容量 10,000 人</span
          >
        </p></LiquidGlassSurface
      >
      <LiquidGlassSurface class="metric" :tint-opacity="0.19"
        ><div class="metric-label">
          <ArrowDownToLine :size="18" />今日累计入园 <span>人</span>
        </div>
        <div class="metric-value">{{ fmt(data.checkedInToday) }}</div>
        <p>
          截至 {{ clock(data.businessTime)
          }}<span class="metric-note"
            >累计离园
            {{ fmt(data.exitedToday ?? 0) }} 人</span
          >
        </p></LiquidGlassSurface
      >
      <LiquidGlassSurface class="metric" :tint-opacity="0.19"
        ><div class="metric-label">
          <CircleParking :size="18" />停车余位 <span>个</span>
        </div>
        <div class="metric-value">{{ snapshot.parkingFree }}</div>
        <p>
          <span class="tiny-dot green" />3 个停车场开放<span class="metric-note"
            >总泊位 1,500 个</span
          >
        </p></LiquidGlassSurface
      >
      <LiquidGlassSurface class="metric alert-metric" :tint-opacity="0.19"
        ><div class="metric-label">
          <Bell :size="18" />未完成告警 <span>条</span>
        </div>
        <div class="metric-value">
          <span data-testid="alert-count">{{ active.length }}</span
          ><span class="urgent-pill">紧急 {{ alertCounts.critical }}</span>
        </div>
        <p>
          待处理 {{ active.length - alertCounts.processing }} 条<span
            class="metric-note"
            >处理中 {{ alertCounts.processing }} 条</span
          >
        </p></LiquidGlassSurface
      >
    </section>
    <section class="top-information" :inert="!!selected">
      <LiquidGlassSurface class="trend-panel info-panel" :tint-opacity="0.2"
        ><div class="section-heading">
          <h2>分时在园趋势</h2>
          <span>今日 · 人</span>
        </div>
        <ScenicChart
          class="trend-chart"
          @ready="onChartReady('trend')"
          :option="trendOption"
          :label="`今日分时在园人数，当前 ${snapshot.visitors} 人`"
        />
        <div class="trend-caption">
          <span><i class="line-key" />在园人数</span
          ><span>每小时采样 · 更新至 {{ clock(data.businessTime) }}</span>
        </div></LiquidGlassSurface
      >
      <LiquidGlassSurface class="facility-panel info-panel" :tint-opacity="0.16"
        ><div class="section-heading">
          <h2><CableCar :size="19" />索道运行</h2>
          <span class="success-text">{{snapshot.points.lower.availability==='open'?'正常运行':'暂停服务'}}</span>
        </div>
        <div class="cable-rows cable-chart" aria-label="上下行索道等待时间比较，单位分钟">
          <div v-for="(key, index) in ['upper', 'lower']" :key="key">
            <span>{{ index === 0 ? "下行候乘" : "上行候乘" }}</span
            ><strong
              >{{ snapshot.points[key].cable!.queueCount
              }}<small> 人</small></strong
            ><span
              >预计
              <b>{{ snapshot.points[key].cable!.waitMinutes }}</b> 分钟</span
            >
            <div class="cable-wait-track"><i :style="{width:`${Math.min(100,snapshot.points[key].cable!.waitMinutes!/15*100)}%`}"/></div>
          </div>
        </div>
        <div class="restroom-summary">
          <Accessibility :size="18" /><span>卫生间</span
          ><strong
            >{{
              toilets.filter((t) => t.availability === "open").length
            }}
            处开放</strong
          ><span class="warning-text"
            >{{
              toilets.filter((t) => t.availability === "maintenance").length
            }}
            处维修</span
          ><span
            >{{
              toilets.filter((t) => t.availability === "closed").length
            }}
            处关闭</span
          >
        </div>
        <div class="restroom-segments" role="img" :aria-label="`卫生间：${toilets.filter(t=>t.availability==='open').length}处开放，${toilets.filter(t=>t.availability==='maintenance').length}处维修，${toilets.filter(t=>t.availability==='closed').length}处关闭`"><i v-for="state in ['open','maintenance','closed']" :key="state" :class="state" :style="{flex:toilets.filter(t=>t.availability===state).length}"/></div>
        <p v-if="busiest" class="busiest">
          较繁忙 · {{ busiest.name
          }}<span>排队 {{ busiest.restroom!.queueCount }} 人</span>
        </p><p v-else class="busiest">当前没有开放的卫生间</p></LiquidGlassSurface
      >
    </section>
    <aside class="left-information" :inert="!entryFinished || !!selected">
      <LiquidGlassSurface class="region-panel info-panel" :tint-opacity="0.17"
        ><div class="section-heading">
          <h2>区域承载</h2>
          <span>人数 / 承载率</span>
        </div>
        <div class="region-chart-wrap">
          <ScenicChart
            :option="regionOption"
            @ready="onChartReady('regions')"
            label="区域承载率排名，点击条形定位区域"
            @select="(i) => focusRegion(rows[i].id)"
          />
          <div class="region-values">
            <button
              v-for="r in rows"
              :key="r.id"
              :title="regionPressureDetail(snapshot,r.id)"
              @click="focusRegion(r.id)"
              :aria-label="`定位${r.name}，${r.count}人，承载率${(r.ratio * 100).toFixed(2)}%`"
            >
              <b>{{ fmt(r.count) }}</b
              ><span :class="{ 'danger-text': r.pressure.ratio != null && r.ratio >= .9 }">{{
                r.pressure.ratio == null
                  ? r.pressure.label
                  : `${(r.ratio * 100).toFixed(2)}%`
              }}</span>
            </button>
          </div>
        </div>
        <p class="panel-footnote">
          {{pressureNote}} <LocateFixed :size="13" /></p
      ></LiquidGlassSurface>
      <LiquidGlassSurface class="parking-panel info-panel" :tint-opacity="0.16"
        ><div class="section-heading">
          <h2>停车资源</h2>
          <span>余位 / 总量</span>
        </div>
        <div v-for="p in parking" :key="p.id" class="parking-row">
          <div>
            <span>{{ p.name }}</span
            ><strong
              >{{ p.parkingFree
              }}<small> / {{ p.parkingCapacity }}</small></strong
            >
          </div>
          <div class="capacity-track">
            <i
              :style="{
                width: `${(1 - p.parkingFree! / p.parkingCapacity!) * 100}%`,
              }"
            />
          </div>
        </div>
        <p class="panel-footnote">
          已用 {{ 1500 - snapshot.parkingFree! }} 个 · 余位
          {{ snapshot.parkingFree }} 个
        </p></LiquidGlassSurface
      >
    </aside>
    <Transition name="emergency-fog"><EmergencyAtmosphere v-if="entryStarted && active.some(a => a.severity === 'critical')" /></Transition>
    <div id="ops-detail-host" class="ops-detail-host" />
    <section ref="mapArea" class="map-area" aria-label="景区运营热力沙盘">
      <component
        :is="MapComponent"
        v-if="mountMap"
        ref="map"
        :show-loading-progress="false"
        :show-region-labels="false"
        :region-labels="regionLabels"
        :focus-right-inset="0"
        :style="{ visibility: mapReady || mapFailed ? 'visible' : 'hidden' }"
        :snapshot="snapshot"
        view-mode="crowd"
        :selected="null"
        :route="null"
        :show-point-markers="false"
        :enable-point-picking="false"
        :show-details="false"
        :show-scroll="true"
        :intro="false"
        :auto-rotate="rotating && !selected"
        :overview-scale="1.08"
        @project="projections = $event"
        @blank="closeDetail"
        @intro-state="onMapState"
        @preparation-progress="onPreparationProgress"
      >
        <template #default>
          <Transition name="region-label-fade"><div v-if="mapReady && !selected" data-scrollbar="off" class="region-label-layer" aria-label="区域人数标注">
            <TransitionGroup name="region-label-fade"><LiquidGlassSurface v-for="label in regionLabels.filter(l=>projections[`region-label-${l.regionId}`]?.visible)" :key="label.regionId" class="ops-region-label" :radius="10" :blur="2" :tint-opacity=".16" :style="{left:`${projections[`region-label-${label.regionId}`].x}px`,top:`${projections[`region-label-${label.regionId}`].y}px`}"><strong>{{label.title}}</strong><span>{{label.value}}</span></LiquidGlassSurface></TransitionGroup>
          </div></Transition>
          <div data-scrollbar="off" class="alert-markers" v-if="mapReady" :inert="!entryFinished">
            <button
              v-for="group in selected ? groupAlerts(siblings) : groups"
              :key="group.anchorId"
              v-show="projections[group.anchorId]?.visible && (!selected || selected.anchorId === group.anchorId)"
              class="alert-marker"
              :class="[
                group.severity,
                { 'is-selected': selected?.anchorId === group.anchorId },
              ]"
              :style="{
                left: `${projections[group.anchorId]?.x ?? 0}px`,
                top: `${projections[group.anchorId]?.y ?? 0}px`,
              }"
              :aria-label="`${group.items[0].location}，${group.items.length}条告警，${severityLabels[group.severity]}`"
              :data-anchor="group.anchorId"
              @click.stop="focusAlert(group.items[0])"
            >
              <component :is="icons[group.items[0].category]" :size="16" /><b
                v-if="group.items.length > 1"
                >{{ group.items.length }}</b
              >
            </button>
          </div>
          <Teleport defer to="#ops-detail-host"><Transition name="detail"><ScenicBubble
            v-if="selected"
            :key="selected.anchorId"
            class="ops-alert-bubble"
            fixed-right
            :anchor="detailAnchor"
            :title="selected.title"
            :eyebrow="`${selected.id} · ${categoryLabels[selected.category]}`"
            :insets="detailInsets"
            @close="closeDetail"
          >
            <div
              v-if="siblings.length > 1"
              class="sibling-tabs"
              aria-label="同地点事件"
            >
              <button
                v-for="(a, index) in siblings"
                :key="a.id"
                :class="{ active: a.id === selectedId }"
                @click="focusAlert(a)"
              >
                事件 {{ index + 1 }} · {{ categoryLabels[a.category] }}
              </button>
            </div>
            <div class="detail-badges">
              <span class="severity-tag" :class="selected.severity">{{
                severityLabels[selected.severity]
              }}</span
              ><span class="status-tag"
                ><component :is="stateIcon[selected.status]" :size="14" />{{
                  statusLabels[selected.status]
                }}</span
              >
            </div>
            <p class="detail-location">
              <LocateFixed :size="16" />{{ selected.location
              }}<span>{{ clock(selected.startedAt) }} 发生</span>
            </p>
            <p class="detail-reason">{{ selected.reason }}</p>
            <div class="detail-metric">{{ selected.metric }}</div>
            <p
              v-if="pointById[selected.anchorId]?.kind === 'safety'"
              class="safety-state"
            >
              设施状态：{{
                safetyStatus(snapshot.points[selected.anchorId].availability)
              }}
            </p>
            <p v-if="selected.previousAlertId" class="safety-state">
              关联上次事件：{{ selected.previousAlertId }}
            </p>
            <h3>处理记录</h3>
            <ol class="handling-timeline">
              <li v-for="(record, index) in selected.records" :key="index">
                <i />
                <div>
                  <strong>{{ record.actor }}</strong
                  ><time>{{ clock(record.at) }}</time>
                  <p>{{ record.text }}</p>
                </div>
              </li>
            </ol>
            <p class="readonly-note">
              <Radio :size="14" />园方只读监控 · 处置进展由前线反馈
            </p>
          </ScenicBubble></Transition></Teleport>
        </template>
      </component>
      <div v-if="prepareError" class="ops-resource-error">
        <p>景区资源准备失败</p>
        <button @click="prepareMap">重新加载沙盘</button>
      </div>
      <LiquidGlassSurface class="map-caption" :radius="14" :blur="2" :tint-opacity="0.09">
        <span class="map-eyebrow">景区空间态势</span
        ><span>热力 · 实时在园</span>
      </LiquidGlassSurface>
      <div class="map-controls" :inert="!entryFinished || !!selected">
        <LiquidGlassButton aria-label="放大沙盘" @click="map?.zoom(0.85)"
          ><Plus :size="18" /></LiquidGlassButton
        ><LiquidGlassButton aria-label="缩小沙盘" @click="map?.zoom(1.15)"
          ><Minus :size="18" /></LiquidGlassButton
        ><LiquidGlassButton aria-label="复位沙盘" @click="reset"
          ><RotateCcw :size="17" /></LiquidGlassButton
        ><LiquidGlassButton
          :aria-label="rotating ? '暂停自转' : '继续自转'"
          @click="rotating = !rotating"
          ><Pause v-if="rotating" :size="17" /><Play v-else :size="17"
        /></LiquidGlassButton>
      </div>
      <div v-if="focusedRegion" class="region-focus-note">
        <LocateFixed :size="15" />{{
          regions.find((r) => r.id === focusedRegion)?.name
        }}<span class="region-pressure-detail">{{regionPressureDetail(snapshot,focusedRegion)}}</span><button @click="closeDetail" aria-label="关闭区域定位">
          <X :size="15" />
        </button>
      </div>
      <LiquidGlassSurface
        class="map-legends"
        :tint-opacity="0.09"
        :radius="14"
        :blur="2"
      >
        <div>
          <span>参考承载压力</span><i class="heat-gradient" :style="{background:pressureGradient}" :title="pressureLegendDescription" role="img" :aria-label="pressureLegendDescription"/><span>低 — 高</span>
        </div>
        <small>{{pressureNote}}</small>
        <div>
          <span>告警</span><i class="tiny-dot blue" />提醒<i
            class="tiny-dot amber"
          />重要<i class="tiny-dot red" />紧急
        </div>
      </LiquidGlassSurface>
    </section>
    <OpsDisposition :stats="alertStats" :theme="theme" :inert="!entryFinished || !!selected" @ready="onChartReady" />
    <aside class="right-information" :inert="!entryFinished || feedMoving">
      <LiquidGlassSurface class="alerts-panel info-panel" :tint-opacity="0.25"
        ><div class="section-heading">
          <h2>
            <Bell :size="18" />{{ historyOpen ? "已处理记录" : "当前告警" }}
            <b class="count-badge">{{
              historyOpen ? resolved.length : active.length
            }}</b>
          </h2>
          <button class="text-button" @click="changeHistory">
            <History :size="15" />{{ historyOpen ? "返回当前" : "历史" }}
          </button>
        </div>
        <div class="filters">
          <label
            ><span class="sr-only">告警级别</span
            ><select v-model="severity" aria-label="告警级别">
              <option value="">全部级别</option>
              <option
                v-for="(label, key) in severityLabels"
                :key="key"
                :value="key"
              >
                {{ label }}
              </option>
            </select></label
          ><label
            ><span class="sr-only">告警类别</span
            ><select v-model="category" aria-label="告警类别">
              <option value="">全部类别</option>
              <option
                v-for="(label, key) in categoryLabels"
                :key="key"
                :value="key"
              >
                {{ label }}
              </option>
            </select></label
          ><label v-if="!historyOpen"
            ><span class="sr-only">处理状态</span
            ><select v-model="status" aria-label="处理状态">
              <option value="">全部状态</option>
              <option value="pending">待处理</option>
              <option value="processing">处理中</option>
            </select></label
          >
        </div>
        <div class="alert-list">
          <button
            v-for="a in visible"
            :key="a.id"
            class="alert-row"
            :class="[a.severity, { 'selected-row': a.id === selectedId }]"
            @click="focusAlert(a)"
            :data-alert-id="a.id"
          >
            <div class="alert-row-top">
              <span class="severity-tag" :class="a.severity">{{
                severityLabels[a.severity]
              }}</span
              ><span class="row-category">{{ categoryLabels[a.category] }}</span
              ><time>{{ clock(a.startedAt) }}</time>
            </div>
            <h3>{{ a.title }}<ChevronRight :size="15" /></h3>
            <div class="alert-row-bottom">
              <span>{{ a.location }}</span
              ><span :class="{ 'processing-text': a.status === 'processing' }"
                ><component :is="stateIcon[a.status]" :size="12" />{{
                  statusLabels[a.status]
                }}</span
              >
            </div>
          </button>
          <div v-if="!visible.length" class="empty-state">
            <Check :size="28" /><strong>{{
              active.length === 0 && !historyOpen
                ? "当前无待处理事件"
                : "没有匹配的事件"
            }}</strong>
            <p>
              {{
                active.length === 0 && !historyOpen
                  ? "景区运行平稳，处理记录已归档。"
                  : "调整筛选条件查看其他记录。"
              }}
            </p>
            <button
              v-if="severity || category || status"
              class="text-button"
              @click="clearFilters"
            >
              清除筛选
            </button>
          </div>
        </div>
        <div class="list-footer">
          <span><Filter :size="12" />当前显示 {{ visible.length }} 条</span
          ><span>人工安排 · 前线处置</span>
        </div>
      </LiquidGlassSurface>
      <LiquidGlassSurface class="feed-panel info-panel" :tint-opacity="0.19"
        ><div class="section-heading">
          <h2><Radio :size="18" />事件动态</h2>
          <span class="live-label"><i />自动更新</span>
        </div>
        <button v-if="newCount" class="new-events" @click="latest">
          {{ newCount }} 条新动态 · 回到最新
        </button>
        <div ref="feed" class="event-feed">
          <button
            v-for="event in data.events"
            :key="event.id"
            class="feed-row"
            :class="{ 'new-event': highlightIds.includes(event.id) }"
            @click="
              focusAlert(data.alerts.find((a) => a.id === event.alertId)!)
            "
          >
            <i
              :class="[event.kind === 'completed' ? 'done' : event.severity]"
            />
            <div>
              <div class="feed-meta">
                <span>{{
                  {
                    created: "新告警",
                    started: "开始处理",
                    completed: "处置完成",
                  }[event.kind]
                }}</span
                ><time>{{ clock(event.at) }}</time>
              </div>
              <strong>{{ event.title }}</strong>
              <p>{{ event.text }}</p>
            </div>
          </button>
        </div></LiquidGlassSurface
      >
    </aside>
    <LiquidGlassSurface
      
      class="environment environment-column"
      :tint-opacity="0.09"
      :radius="14"
      :blur="2"
      aria-label="环境指标"
      ><h2>环境监测</h2>
      <div v-for="item in env" :key="item.label" class="environment-item">
        <component :is="item.icon" :size="17" />
        <div>
          <span>{{ item.label }}</span>
          <p>
            <b>{{ item.value }}</b
            ><small>{{ item.unit }}</small>
          </p>
        </div>
      </div></LiquidGlassSurface
    >
    <ScenicLoadingScreen v-if="!entryStarted && !prepareError" :theme="theme" :progress="preparation" label="园方大屏加载进度" :message="mountMap?'正在构建沙盘与卷轴':'正在准备监控界面'" @complete="startEntry" />

  </main>
</template>

<style scoped>.ops-live-login{max-width:480px;margin:12vh auto;padding:30px;color:#dae9e1;background:#203a32;border-radius:20px}.ops-live-login label{display:block;margin:20px 0}.ops-live-login input{display:block;width:100%;padding:12px;margin-top:8px}.ops-live-login button{padding:12px 20px}</style>
