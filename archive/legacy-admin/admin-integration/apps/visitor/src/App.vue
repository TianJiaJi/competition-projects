<script setup lang="ts">
import {
  type ComponentPublicInstance,
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref, shallowRef,
  watch,
} from "vue";
import {
  Mountain,
  CloudSun,
  ArrowUpRight,
  X,
  Plus,
  Minus,
  Expand,
  MapPin,
  Compass,
  Layers,
  Route,
  Accessibility,
  CircleParking,
  CableCar,
  Store,
  ChevronRight,
  ChevronDown,
  Smartphone,
  Bell,
  Clock3,
  ArrowDown,
  Footprints,
  RefreshCw,
  WifiOff,
  Search,
  Info, Monitor, ShieldCheck, HeartPulse, Cross, PhoneCall, LifeBuoy, FireExtinguisher, Tent,
} from "lucide-vue-next";
import QRCode from "qrcode";
import {
  points,
  pointById,
  regions,
  kindLabels,
  loadLabels,
  availabilityLabels,
  findRoute,
  buildHandoffUrl, resolveTerminal, viewForPoint, safetyStatus, safetyLabels,
} from "@scenic/scenic";
import { connectPublicClient } from "@scenic/client";
import type {
  PublicSnapshot,
  ConnectionState,
  TravelMode,
  PointKind, ScenicViewMode,
} from "@scenic/contracts";
import { ScenicMap, ScenicPointInfo } from "@scenic/ui/scenic";
import { LiquidGlassSurface, LiquidGlassButton } from "@scenic/ui/liquid-glass";
import type {ScrollIntroState} from '@scenic/ui/scroll';
import { ContourBackground } from "@scenic/ui/contour";
import { registerViewTool } from "./webmcp";

const introState=ref<ScrollIntroState>('loading');
const introLocked=computed(()=>!['ready','failed'].includes(introState.value));
const chromeVisible=computed(()=>['finishing','ready','failed'].includes(introState.value));
function onIntroState(state:ScrollIntroState){
  introState.value=state;
  if(state==='ready'||state==='failed'){lastActivity.value=Date.now();hasInteracted.value=false;}
}
const mode = import.meta.env.VITE_DATA_MODE === "live" ? "live" : "sample";
const alwaysOpen = new URLSearchParams(window.location.search).get("alwaysOpen") === "1";
const empty: PublicSnapshot = {
  revision: 0,
  updatedAt: "",
  parkOpen: false,
  visitors: null,
  parkingFree: null,
  weather: {
    label: "读取中",
    temperature: null,
    humidity: null,
    wind: "—",
    aqi: null,
    ions: null,
  },
  points: {},
  regions: {},
  closedEdgeIds: [],
  announcements: [],
};
const snapshot = ref<PublicSnapshot>(empty),
  connection = ref<ConnectionState>("loading"),
  now = ref(Date.now());
const panel = ref<
  | "attractions"
  | "facilities"
  | "destinations"
  | "detail"
  | "route"
  | "phone"
  | "weather"
  | "announcement"
  | null
>(null);
const terminal=resolveTerminal(window.location.search);
const viewMode=ref<ScenicViewMode>('default');
const heat=computed(()=>viewMode.value==='crowd');
const viewOptions: {value:ScenicViewMode;label:string;icon:typeof Layers}[]=[{value:'default',label:'游览',icon:Footprints},{value:'crowd',label:'人流',icon:Layers},{value:'toilet',label:'卫生间',icon:Accessibility},{value:'safety',label:'安全',icon:ShieldCheck}];
const legendTitle=computed(()=>({default:'游览',crowd:'区域人流',toilet:'卫生间',safety:'安全设施'})[viewMode.value]);
const selectedId = ref<string | null>(null),
  origin = ref(terminal.id),
  destination = ref(""),
  travelMode = ref<TravelMode>("walk"),
  filter = ref("all");
const scenicMap = ref<InstanceType<typeof ScenicMap>>(),
  panelElement = ref<HTMLElement>(),
  query = ref(""),
  qr = ref(""),
  qrError = ref(false),
  level = ref(0);
const lastActivity = ref(Date.now()),
  idleSeconds = computed(() =>
    Math.max(0, Math.ceil((120000 - (now.value - lastActivity.value)) / 1000)),
  );
const hasInteracted=ref(false);
const lastTrigger = ref<HTMLElement | null>(null);
function bindPanel(element:Element|ComponentPublicInstance|null){
  panelElement.value=element instanceof HTMLElement?element:(element as ComponentPublicInstance|null)?.$el;
}
function changeView(value:ScenicViewMode){
  if(introLocked.value||viewMode.value===value)return;
  closePanel();viewMode.value=value;touch();
}
function matchPointView(id:string){
  if(pointById[id]&&id!==terminal.id)viewMode.value=viewForPoint(pointById[id]);

}
const projections=shallowRef<Record<string,{x:number;y:number;visible:boolean}>>({});
const focusedPointId=computed(()=>panel.value==='detail'?selectedId.value:null);
const activeNav=computed(()=>{
  if(panel.value==='route'||panel.value==='destinations')return 'destinations';
  if(panel.value==='attractions'||panel.value==='facilities')return panel.value;
  if(panel.value==='detail'&&selectedId.value)return pointById[selectedId.value]?.kind==='attraction'?'attractions':'facilities';
  return null;
});
watch(focusedPointId,(id,previous)=>{
  if(id)scenicMap.value?.focus(id);
  else if(previous)scenicMap.value?.restoreFocus();
},{flush:'post'});
type Rect={left:number;top:number;width:number;height:number};
const dockElement=ref<HTMLElement>();
const informationElement=ref<HTMLElement>();
const headerBottom=ref(0);
function bindInformation(element:Element|ComponentPublicInstance|null){informationElement.value=element instanceof HTMLElement?element:(element as ComponentPublicInstance|null)?.$el;}
const cardRect=ref<Rect|null>(null),navRects=ref<Record<string,Rect>>({});
const viewportHeight=ref(window.innerHeight);
let leaderObserver:ResizeObserver|undefined;
function bindDock(element:Element|ComponentPublicInstance|null){dockElement.value=element instanceof HTMLElement?element:(element as ComponentPublicInstance|null)?.$el;}
function measureLeaders(){
  viewportHeight.value=window.innerHeight;
  headerBottom.value=informationElement.value?.getBoundingClientRect().bottom??0;
  cardRect.value=panelElement.value?.getBoundingClientRect()??null;
  navRects.value=Object.fromEntries(Array.from(dockElement.value?.querySelectorAll<HTMLElement>('[data-nav]')??[]).map(el=>[el.dataset.nav!,el.getBoundingClientRect()]));
}
watch([panelElement,dockElement,informationElement],()=>{
  leaderObserver?.disconnect();leaderObserver=new ResizeObserver(measureLeaders);
  if(panelElement.value)leaderObserver.observe(panelElement.value);
  if(dockElement.value)leaderObserver.observe(dockElement.value);
  if(informationElement.value)leaderObserver.observe(informationElement.value);
  measureLeaders();
},{flush:'post'});
function connectCard(source:Rect){
  const card=cardRect.value;if(!card)return null;
  const x=source.left+source.width/2,y=source.top+source.height/2;
  // Every card shares one screen-fixed connection point, independent of content.
  const x2=card.left,y2=viewportHeight.value/2;
  const dx=x2-x,dy=y2-y;
  if(Math.abs(dx)<1&&Math.abs(dy)<1)return null;
  const t=Math.min(source.width/2/Math.max(Math.abs(dx),.001),source.height/2/Math.max(Math.abs(dy),.001));
  return {x1:x+dx*Math.min(t,1),y1:y+dy*Math.min(t,1),x2,y2};
}
const pointLeader=computed(()=>{
  const id=focusedPointId.value,p=id?projections.value[id]:null;
  if(!p?.visible)return null;
  return connectCard({left:p.x-28,top:p.y-28,width:id===terminal.id?141:56,height:56});
});
const navLeader=computed(()=>{
  const rect=activeNav.value?navRects.value[activeNav.value]:null;
  return panel.value!=='detail'&&rect?connectCard(rect):null;
});
const summitReturn=computed(()=>['summit','terminal-summit'].includes(origin.value)&&destination.value==='market');
let stopClient: () => void = () => {};
let unregisterTools: () => void = () => {};
let ticker: ReturnType<typeof setInterval>;
const ready = computed(
  () => connection.value === "sample" || connection.value === "connected",
);
const effective = computed<PublicSnapshot>(() =>
  ready.value
    ? snapshot.value
    : {
        ...snapshot.value,
        points: Object.fromEntries(
          points.map((p) => [
            p.id,
            { availability: "unknown", load: "unknown" },
          ]),
        ),
        regions: Object.fromEntries(
          regions.map((r) => [
            r.id,
            { availability: "unknown", load: "unknown", count: null },
          ]),
        ),
        visitors: null,
        parkingFree: null,
      },
);
const selected = computed(() =>
  selectedId.value ? pointById[selectedId.value] : null,
);
const currentRoute = computed(() =>
  destination.value
    ? findRoute(
        origin.value,
        destination.value,
        travelMode.value,
        effective.value,
      )
    : null,
);
const mobileBase = import.meta.env.VITE_MOBILE_URL;
const phoneUrl = computed(() =>
  mobileBase
    ? buildHandoffUrl(
        mobileBase,
        currentRoute.value?.ok
          ? {
              origin: origin.value,
              destination: destination.value,
              mode: travelMode.value,
            }
          : selected.value
            ? { point: selected.value.id }
            : {},
      )
    : "",
);
let qrVersion = 0;
watch(
  phoneUrl,
  async (url) => {
    const version = ++qrVersion;
    qr.value = "";
    qrError.value = false;
    if (!url) return;
    try {
      const result = await QRCode.toDataURL(url, {
        width: 240,
        margin: 4,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      if (version === qrVersion) qr.value = result;
    } catch {
      if (version === qrVersion) qrError.value = true;
    }
  },
  { immediate: true },
);
const list = computed(() =>
  points.filter(
    (p) =>
      (panel.value === "attractions"
        ? p.kind === "attraction"
        : panel.value === "facilities"
          ? p.kind !== "attraction" &&
            (filter.value === "all" || p.kind === filter.value)
          : true) && p.name.includes(query.value),
  ),
);
const originOptions = computed(() =>
  points.filter(
    (p) =>
      effective.value.points[p.id]?.availability === "open" &&
      effective.value.regions[p.regionId]?.availability === "open",
  ),
);
const dateText = computed(() =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now.value),
);
const timeText = computed(() =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now.value),
);
const icons: Record<PointKind, typeof Mountain> = {
  terminal: Monitor,
  safety: ShieldCheck,
  attraction: Mountain,
  toilet: Accessibility,
  parking: CircleParking,
  cable: CableCar,
  commercial: Store,
  entrance: MapPin,
};
const safetyIcons={aed:HeartPulse,'first-aid':Cross,help:PhoneCall,lifebuoy:LifeBuoy,extinguisher:FireExtinguisher,shelter:Tent};
const filters = [
  ["all", "全部"],
  ["safety", "安全设施"],
  ["terminal", "游客终端"],
  ["toilet", "卫生间"],
  ["parking", "停车"],
  ["cable", "索道"],
  ["commercial", "餐饮补给"],
  ["entrance", "出入口"],
];
function touch() {
  if(introLocked.value)return;
  hasInteracted.value=true;
  lastActivity.value = Date.now();
  now.value = Date.now();
}
function rememberTrigger() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && !panelElement.value?.contains(active))
    lastTrigger.value = active;
}
async function openPanel(value: typeof panel.value) {
  if(introLocked.value)return;
  rememberTrigger();

  panel.value = value;
  query.value = "";
  touch();
  await nextTick();
  const content=panelElement.value?.querySelector<HTMLElement>(".panel-content");
  if(content)content.scrollTop=0;
  panelElement.value
    ?.querySelector<HTMLButtonElement>(".panel-close")
    ?.focus({ preventScroll: true });
}
function closePanel() {
  panel.value = null;
  selectedId.value = null;
  destination.value = "";
  travelMode.value = "walk";
  filter.value = "all";
  touch();
  lastTrigger.value?.focus({ preventScroll: true });
}
function selectPoint(id: string, preserveView=false) {
  if(introLocked.value)return;
  if(panel.value==='detail'&&selectedId.value===id){closePanel();return;}
  if(!preserveView)matchPointView(id);
  selectedId.value = id;
  destination.value = "";
  travelMode.value = "walk";
  void openPanel("detail");

}
function showRoute(id: string) {
  if(introLocked.value)return;
  origin.value=terminal.id;
  matchPointView(id);
  selectedId.value = id;
  destination.value = id;
  travelMode.value = "walk";
  void openPanel("route");

}
function returnFromSummit() {
  if(introLocked.value)return;
  showRoute('market');

}
function reset() {
  if(introLocked.value)return;

  panel.value = null;
  selectedId.value = null;
  viewMode.value = "default";
  origin.value = terminal.id;
  destination.value = "";
  travelMode.value = "walk";
  filter.value = "all";
  query.value = "";
  scenicMap.value?.reset(true);
  hasInteracted.value=false;
  lastActivity.value=Date.now();
  nextTick(()=>scenicMap.value?.resume());
}
function activity(e: Event) {
  if (e instanceof PointerEvent && e.type === "pointermove" && !e.buttons)
    return;
  touch();
}
function keyboard(e: KeyboardEvent) {
  if(introLocked.value)return;
  if(e.key === "Escape") {if(panel.value)closePanel();}
}
const activityEvents = [
  "pointerdown",
  "pointermove",
  "wheel",
  "touchstart",
  "keydown",
];
onMounted(() => {
  window.addEventListener("resize",measureLeaders);
  stopClient = connectPublicClient({
    sampleOptions: { alwaysOpen },
    mode,
    onSnapshot: (s) => (snapshot.value = s),
    onState: (s) => (connection.value = s),
  });
  unregisterTools = registerViewTool(
    (id)=>selectPoint(id,true),
    (value) => {
      if(introLocked.value)return;
      changeView(value);
      touch();
    },
    points.map((p) => p.id),
    async () => {
      await nextTick();
    },
    terminal.id,
  );
  ticker = setInterval(() => {
    now.value = Date.now();
    if (hasInteracted.value && idleSeconds.value === 0) reset();
  }, 500);
  activityEvents.forEach((e) =>
    window.addEventListener(e, activity, { passive: true }),
  );
  window.addEventListener("keydown", keyboard);
});
onBeforeUnmount(() => {
  leaderObserver?.disconnect();window.removeEventListener("resize",measureLeaders);
  stopClient();
  unregisterTools();
  clearInterval(ticker);
  activityEvents.forEach((e) => window.removeEventListener(e, activity));
  window.removeEventListener("keydown", keyboard);
});
watch(origin, () => {
  travelMode.value = "walk";
  if(panel.value === "route") touch();
});
const panelTitle = computed(
  () =>
    ({
      attractions: "山水之间",
      facilities: "沿途服务",
      destinations: "想去哪里",
      detail: selected.value?.name ?? "地点详情",
      route: "到达路线",
      phone: "把山水带在身边",
      weather: "今日天气",
      announcement: "游览公告",
    })[panel.value ?? "detail"],
);
const stateText = (id: string) => {
  const s = effective.value.points[id];
  if(pointById[id]?.kind==='safety')return safetyStatus(s?.availability);
  if(pointById[id]?.kind==='terminal')return id===terminal.id?'我在这里':'游客终端';
  return !s
    ? "状态未知"
    : s.availability !== "open"
      ? availabilityLabels[s.availability]
      : loadLabels[s.load];
};
const stateClass = (id: string) =>
  pointById[id]?.kind==='safety'?(effective.value.points[id]?.availability==='open'?'quiet':['closed','maintenance'].includes(effective.value.points[id]?.availability)?'busy':'unknown'):
  effective.value.points[id]?.availability === "open"
    ? effective.value.points[id]?.load
    : "unknown";
const formatNumber = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("zh-CN");
</script>

<template>
  <main
    class="visitor-app"
    :class="{
      'has-query': panel,
      'quality-low': level > 0,
      'quality-minimal': level >= 3,
    }"
    :style="{'--header-bottom':`${headerBottom}px`}"
    @contextmenu.prevent
  >
    <ContourBackground class="visitor-background" aria-hidden="true" />
    <section class="landscape-viewport" aria-label="景区沙盘">
      <ScenicMap
        ref="scenicMap"
        show-scroll intro
        @intro-state="onIntroState"
        @project="projections=$event"
        :snapshot="effective"
        :show-details="false"
        :heat="heat"
        :view-mode="viewMode"
        :current-terminal-id="terminal.id"
        :selected="selectedId"
        :route="panel==='route'?currentRoute:null"
        @select="selectPoint"
        @blank="panel==='detail'&&closePanel()"
        @performance="level = $event"
      />
    </section>
    <div class="visitor-interface" :class="{'intro-hidden':!chromeVisible}" :inert="introLocked" :aria-hidden="introLocked">
    <header class="topbar">
      <LiquidGlassSurface class="identity" :tint-opacity="0.09">
        <div class="brand-mark">
          <Mountain :size="32" :stroke-width="1.4" />
        </div>
        <div>
          <div class="brand-overline">QINGLAN · SCENIC GUIDE</div>
          <h1>青岚山境<span class="seal">山水</span></h1>
          <div class="brand-meta">
            游客导览<span class="divider"></span
            ><span :class="['park-state', { closed: !snapshot.parkOpen }]">{{
              ready ? (snapshot.parkOpen ? "开园中" : "已闭园") : "状态读取中"
            }}</span>
          </div>
        </div>
      </LiquidGlassSurface>
      <LiquidGlassSurface :ref="bindInformation" class="top-information" :tint-opacity="0.09">
        <div class="time-weather">
          <div class="time-block">
            <span class="time num">{{ timeText }}</span
            ><span class="date">{{ dateText }}</span>
          </div>
          <LiquidGlassButton variant="transparent" :tint-opacity="0.09"
            class="weather-button"
            aria-label="查看天气详情"
            @click="openPanel('weather')"
          >
            <CloudSun :size="31" :stroke-width="1.4" /><span
              >{{ ready ? snapshot.weather.label : "—"
              }}<strong
                >{{ ready ? (snapshot.weather.temperature ?? "—") : "—"
                }}<small>°C</small></strong
              ></span
            >
          </LiquidGlassButton>
        </div>
        <div class="metrics">
          <div>
            <span>实时在园</span
            ><strong class="num" data-testid="visitors"
              >{{ formatNumber(effective.visitors) }}<small>人</small></strong
            >
          </div>
          <div>
            <span>停车余位</span
            ><strong class="num"
              >{{ formatNumber(effective.parkingFree)
              }}<small>个</small></strong
            >
          </div>
        </div>
      </LiquidGlassSurface>
    </header>
    <div class="notice-stack">
      <p v-if="terminal.warning" class="terminal-warning" role="status">{{terminal.warning}}</p>
      <LiquidGlassButton variant="transparent" :tint-opacity="0.09"
        v-if="snapshot.announcements.length"
        class="announcement"
        @click="openPanel('announcement')"
      >
        <Bell :size="18" /><span>{{ snapshot.announcements[0].title }}</span
        ><ChevronRight :size="17" />
      </LiquidGlassButton>
      <div class="data-caption">
        <span v-if="mode === 'sample'">{{ alwaysOpen ? '演示数据 · 常开测试' : '演示数据' }}</span
        ><span v-else-if="connection === 'connected'">数据已更新</span
        ><span v-else-if="connection === 'loading'">正在连接景区数据</span
        ><span v-else class="offline"
          ><WifiOff :size="15" />连接中断，状态暂不可用</span
        >
      </div>
    </div>

    <LiquidGlassSurface
      class="map-tools"

      aria-label="沙盘视角控制"
    >
      <LiquidGlassButton variant="transparent" :tint-opacity="0.09"
        aria-label="放大沙盘"
        @click="
          scenicMap?.zoom(0.85);
          touch();
        "
      >
        <Plus :size="23" /></LiquidGlassButton
      ><LiquidGlassButton variant="transparent" :tint-opacity="0.09"
        aria-label="缩小沙盘"
        @click="
          scenicMap?.zoom(1.15);
          touch();
        "
      >
        <Minus :size="23" /></LiquidGlassButton
      ><span></span
      ><LiquidGlassButton variant="transparent" :tint-opacity="0.09"
        aria-label="看全景"
        @click="
          if (panel === 'detail') closePanel();
          scenicMap?.reset();
          touch();
        "
      >
        <Expand :size="21" />
      </LiquidGlassButton>
    </LiquidGlassSurface>
    <LiquidGlassSurface as="aside" class="legend" aria-label="地图图例">
      <div class="legend-title">{{legendTitle}}</div>
      <template v-if="viewMode==='crowd'">
        <div class="heat-legend"><div><span>区域人流</span><span>低 — 高</span></div><div class="heat-scale"></div></div>
        <p class="legend-note">区域人数以当前数据为准</p>
      </template>
      <template v-else-if="viewMode==='safety'">
        <div class="legend-icons safety-legend"><span v-for="(label,key) in safetyLabels" :key="key"><component :is="safetyIcons[key]" :size="17"/>{{label}}</span></div>
        <div class="legend-items"><span class="quiet"><i/>可用</span><span class="busy"><i/>不可用</span><span class="unknown"><i/>状态未知</span></div>
      </template>
      <template v-else>
        <div v-if="viewMode==='default'" class="legend-icons"><span><Mountain :size="17"/>景点</span><span><CableCar :size="17"/>索道</span><span><Store :size="17"/>补给</span><span><CircleParking :size="17"/>停车</span><span><MapPin :size="17"/>出入口</span><span><Monitor :size="17"/>游客终端</span></div>
        <div class="legend-items"><span class="quiet"><i/>空闲</span><span class="moderate"><i/>适中</span><span class="busy"><i/>拥堵</span><span class="unknown"><i/>未开放 / 未知</span></div>
      </template>
    </LiquidGlassSurface>
    <LiquidGlassSurface as="nav" :ref="bindDock" class="bottom-dock" aria-label="主要功能">
      <LiquidGlassButton :variant="(activeNav === 'attractions') ? 'primary' : 'transparent'" :tint-opacity="0.09"
        :class="{ active: activeNav === 'attractions' }" data-nav="attractions"
        @click="openPanel('attractions')"
      >
        <Mountain :size="25" :stroke-width="1.6" /><span>景点</span></LiquidGlassButton
      ><LiquidGlassButton :variant="(activeNav === 'facilities') ? 'primary' : 'transparent'" :tint-opacity="0.09"
        :class="{ active: activeNav === 'facilities' }" data-nav="facilities"
        @click="openPanel('facilities')"
      >
        <Compass :size="25" :stroke-width="1.6" /><span>设施</span></LiquidGlassButton
      ><LiquidGlassButton :variant="(activeNav === 'destinations') ? 'primary' : 'transparent'" :tint-opacity="0.09"
        :class="{ active: activeNav === 'destinations' }" data-nav="destinations"
        @click="openPanel('destinations')"
      >
        <Route :size="25" :stroke-width="1.6" /><span>路线</span></LiquidGlassButton
      ><span class="dock-divider"></span
      ><LiquidGlassButton v-for="view in viewOptions" :key="view.value" :variant="viewMode===view.value?'primary':'transparent'" :tint-opacity="0.09" :aria-pressed="viewMode===view.value" @click="changeView(view.value)">
        <component :is="view.icon" :size="25"/><span>{{view.label}}</span>
      </LiquidGlassButton>
    </LiquidGlassSurface>
    <LiquidGlassButton variant="transparent" :tint-opacity="0.09"
      class="phone-entry"
      aria-label="手机导览"
      @click="
        selectedId = null;
        openPanel('phone');
      "
    >
      <span class="phone-icon"
        ><Smartphone :size="25" :stroke-width="1.5" /></span
      ><span>手机导览<small>扫码随身查看</small></span
      ><ArrowUpRight :size="20" />
    </LiquidGlassButton>
    <svg v-if="panel&&(pointLeader||navLeader)" class="card-leaders" aria-hidden="true">
      <g v-if="pointLeader" class="point-card-leader"><line v-bind="pointLeader"/><circle :cx="pointLeader.x2" :cy="pointLeader.y2" r="3"/></g>
      <g v-if="!pointLeader&&navLeader" class="nav-card-leader"><line v-bind="navLeader"/><circle :cx="navLeader.x2" :cy="navLeader.y2" r="3"/></g>
    </svg>
    <Transition name="panel"
      ><LiquidGlassSurface as="aside"
        v-if="panel"
        :ref="bindPanel"
        class="detail-panel"
        :tint-opacity="0.82"
        role="dialog"
        aria-modal="false"
        aria-label="导览详情"
      >
        <header class="panel-header">
          <div>
            <span class="eyebrow">{{
              panel === "route"
                ? "YOUR WAY"
                : panel === "detail"
                  ? selected
                    ? kindLabels[selected.kind]
                    : "EXPLORE"
                  : "EXPLORE QINGLAN"
            }}</span>
            <h2>{{ panelTitle }}</h2>
          </div>
          <LiquidGlassButton variant="transparent" :tint-opacity="0.09"
            class="panel-close icon-button"
            aria-label="关闭详情"
            @click="closePanel"
          >
            <X :size="24" />
          </LiquidGlassButton>
        </header>
        <div class="panel-content">
          <template
            v-if="
              panel === 'attractions' ||
              panel === 'facilities' ||
              panel === 'destinations'
            "
          >
            <p class="panel-intro">
              {{
                panel === "destinations"
                  ? "选择目的地，查看到达路径。"
                  : panel === "attractions"
                    ? "沿着山路，遇见每一处风景。"
                    : "查找沿途的便利与休憩。"
              }}
            </p>
            <div v-if="panel === 'facilities'" class="filter-row">
              <LiquidGlassButton :variant="(filter === value) ? 'primary' : 'transparent'" :tint-opacity="0.09"
                v-for="[value, label] in filters"
                :key="value"
                :aria-pressed="filter === value"
                :class="{ active: filter === value }"
                @click="filter = value"
              >
                {{ label }}
              </LiquidGlassButton>
            </div>
            <label class="search-field"
              ><Search :size="20" /><input
                v-model="query"
                aria-label="按名称查找地点"
                placeholder="按名称查找"
            /></label>
            <div class="point-list">
              <LiquidGlassButton variant="transparent" :tint-opacity="0.09"
                v-for="(point, index) in list"
                :key="point.id"
                :data-point-choice="point.id"
                @click="
                  panel === 'destinations'
                    ? showRoute(point.id)
                    : selectPoint(point.id)
                "
              >
                <span class="list-icon"
                  ><component
                    :is="point.safetyKind?safetyIcons[point.safetyKind]:icons[point.kind]"
                    :size="24"
                    :stroke-width="1.4" /></span
                ><span class="list-copy"
                  ><strong>{{ point.name }}</strong
                  ><span :class="['state', stateClass(point.id)]">{{
                    stateText(point.id)
                  }}</span></span
                ><ChevronRight :size="20" />
              </LiquidGlassButton>
              <p v-if="!list.length" class="empty-state">
                没有找到对应地点，试试其他名称。
              </p>
            </div>
          </template>
          <template v-else-if="panel === 'detail' && selected">
            <ScenicPointInfo :point="selected" :snapshot="effective" image-url="/images/qinglv-landscape.png" @route="showRoute" @return="returnFromSummit">
              <template #handoff>
            <div v-if="phoneUrl" class="qr-section">
              <div><Smartphone :size="20" /><span>手机继续查看</span></div>
              <img
                v-if="qr"
                :src="qr"
                alt="扫码在手机查看当前地点"
                width="180"
                height="180"
              />
              <p v-else-if="qrError" role="alert">二维码暂不可用</p>
              <a :href="phoneUrl" target="_blank" rel="noopener"
                >打开手机页面<ArrowUpRight :size="15"
              /></a>
            </div>
              </template>
            </ScenicPointInfo>
          </template>
          <template v-else-if="panel === 'route'">
            <div class="route-heading">
              <Route :size="23" /><span>{{
                summitReturn
                  ? "山顶返程"
                  : "到达路径"
              }}</span
              ><span class="route-mode">{{
                travelMode === "cable" ? "索道下行" : "步行"
              }}</span>
            </div>
            <div class="route-fields">
              <label
                ><span class="stop-dot start"></span><span>起点</span
                ><select v-model="origin" aria-label="路线起点">
                  <option
                    v-if="!originOptions.some((p) => p.id === origin)"
                    :value="origin"
                  >
                    {{ pointById[origin]?.name }} · 暂不可用
                  </option>
                  <option v-for="p in originOptions" :key="p.id" :value="p.id">
                    {{ p.name }}
                  </option>
                </select></label
              >
              <div class="route-field-end">
                <span class="stop-dot end"></span><span>终点</span
                ><strong>{{ pointById[destination]?.name }}</strong>
              </div>
            </div>
            <div class="status-line">
              <span :class="['state', stateClass(destination)]">{{
                stateText(destination)
              }}</span>
            </div>
            <div
              v-if="summitReturn"
              class="travel-options"
            >
              <LiquidGlassButton :variant="(travelMode === 'walk') ? 'primary' : 'transparent'" :tint-opacity="0.09"
                :aria-pressed="travelMode === 'walk'"
                :class="{ active: travelMode === 'walk' }"
                @click="travelMode = 'walk'"
              >
                <Footprints :size="22" />步行返程</LiquidGlassButton
              ><LiquidGlassButton :variant="(travelMode === 'cable') ? 'primary' : 'transparent'" :tint-opacity="0.09"
                :aria-pressed="travelMode === 'cable'"
                :class="{ active: travelMode === 'cable' }"
                :disabled="
                  effective.points.upper?.availability !== 'open' ||
                  effective.points.lower?.availability !== 'open' ||
                  effective.closedEdgeIds.includes('cable-down')
                "
                @click="travelMode = 'cable'"
              >
                <CableCar :size="22" />索道返程
              </LiquidGlassButton>
            </div>
            <p
              v-if="summitReturn"
              class="cable-status"
            >
              索道：{{
                effective.points.upper?.availability === "open"
                  ? loadLabels[effective.points.upper.load]
                  : (effective.points.upper?.reason ?? "状态暂不可用")
              }}<template
                v-if="effective.points.upper?.availability !== 'open'"
              >
                请沿开放山路步行返程。</template
              >
            </p>
            <div
              v-if="currentRoute?.ok"
              class="route-result"
              aria-live="polite"
            >
              <span
                >{{
                  travelMode === "cable" ? "含索道及接驳步道" : "沿开放步道"
                }}
                · 全程</span
              ><strong class="num"
                >{{
                  currentRoute.distance >= 1000
                    ? (currentRoute.distance / 1000).toFixed(2)
                    : currentRoute.distance
                }}<small>{{
                  currentRoute.distance >= 1000 ? "公里" : "米"
                }}</small></strong
              >
              <p>
                {{
                  currentRoute.distance === 0
                    ? "起点与终点相同，您已在目的地。"
                    : travelMode === "cable"
                      ? "前往索道上站，下行后步行至归云集。"
                      : "沿沙盘中带箭头的路线前往目的地。"
                }}
              </p>
            </div>
            <div v-else class="route-error" role="alert">
              <Info :size="24" />
              <p>
                {{
                  currentRoute && !currentRoute.ok
                    ? currentRoute.reason
                    : "请选择目的地。"
                }}
              </p>
            </div>
            <div v-if="currentRoute?.ok && phoneUrl" class="qr-section">
              <div><Smartphone :size="20" /><span>手机继续查看路线</span></div>
              <img
                v-if="qr"
                :src="qr"
                alt="扫码在手机接续当前路线"
                width="180"
                height="180"
              /><a :href="phoneUrl" target="_blank" rel="noopener"
                >打开手机路线<ArrowUpRight :size="15"
              /></a>
            </div>
            <LiquidGlassButton variant="transparent" :tint-opacity="0.09" class="secondary-button" @click="openPanel('destinations')">
              <MapPin :size="20" />更换目的地
            </LiquidGlassButton>
          </template>
          <template v-else-if="panel === 'phone'"
            ><template v-if="phoneUrl"
              ><p class="panel-intro">
                扫码打开随身导览，在手机上查看景点、设施与路线。
              </p>
              <div class="phone-qr">
                <img
                  v-if="qr"
                  :src="qr"
                  alt="手机导览二维码"
                  width="240"
                  height="240"
                /><a :href="phoneUrl" target="_blank" rel="noopener"
                  >打开随身导览<ArrowUpRight :size="18"
                /></a></div
            ></template>
            <p v-else class="panel-intro">
              手机导览尚未接入。当前可直接在大屏查看景点、设施和到达路线。
            </p></template
          >
          <template v-else-if="panel === 'weather'"
            ><div class="weather-detail">
              <CloudSun :size="58" :stroke-width="1" /><strong
                >{{
                  ready ? (snapshot.weather.temperature ?? "—") : "—"
                }}°</strong
              ><span>{{
                ready ? snapshot.weather.label : "数据暂不可用"
              }}</span>
            </div>
            <dl class="weather-grid">
              <div>
                <dt>相对湿度</dt>
                <dd>{{ ready ? (snapshot.weather.humidity ?? "—") : "—" }}%</dd>
              </div>
              <div>
                <dt>风向与风速</dt>
                <dd>{{ ready ? snapshot.weather.wind : "—" }}</dd>
              </div>
              <div>
                <dt>空气质量 AQI</dt>
                <dd>{{ ready ? (snapshot.weather.aqi ?? "—") : "—" }}</dd>
              </div>
              <div>
                <dt>负氧离子</dt>
                <dd>
                  {{ ready ? (snapshot.weather.ions ?? "—") : "—"
                  }}<small> 个/cm³</small>
                </dd>
              </div>
            </dl>
            <p class="hours">
              景区开放时间 08:00—18:00<br />停止入园时间 17:00
            </p></template
          >
          <template v-else-if="panel === 'announcement'"
            ><article
              v-for="notice in snapshot.announcements"
              :key="notice.id"
              class="notice-article"
            >
              <Bell :size="24" />
              <h3>{{ notice.title }}</h3>
              <p>{{ notice.body }}</p>
              <LiquidGlassButton variant="transparent" :tint-opacity="0.09"
                v-if="notice.pointId"
                class="secondary-button"
                @click="selectPoint(notice.pointId)"
              >
                <MapPin :size="20" />查看位置
              </LiquidGlassButton>
            </article>
            <p v-if="!snapshot.announcements.length">
              暂无游览公告。
            </p></template
          >
        </div>
      </LiquidGlassSurface></Transition
    >
    <LiquidGlassSurface
      v-if="hasInteracted && idleSeconds <= 10"
      class="idle-notice"
      role="status"
      aria-live="polite"
    >
      <RefreshCw :size="20" /><span>{{ idleSeconds }} 秒后返回首页</span
      ><LiquidGlassButton variant="transparent" :tint-opacity="0.09" @click="touch">继续查看</LiquidGlassButton>
    </LiquidGlassSurface>
    </div>
  </main>
</template>

<style scoped>
.visitor-interface{display:contents;}
.visitor-interface>:deep(*){transition:opacity .6s;}
.visitor-interface.intro-hidden>:deep(*){opacity:0;pointer-events:none;}
@media(prefers-reduced-motion:reduce){.visitor-interface>:deep(*){transition:none;}}
</style>
