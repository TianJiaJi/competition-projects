<script setup lang="ts">
import "./community-public.css";
import type { CommunityView } from "@scene/model/community";
import BubbleLeader from "./BubbleLeader.vue";
import { computed, ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import {
  LiquidGlassSurface as GlassSurface,
  LiquidGlassButton as GlassButton,
} from "@scene/ui/liquid-glass";
import { ScenicChart } from "@scene/ui/charts";
import {
  Building2,
  House,
  Trees,
  Compass,
  HeartHandshake,
  Bell,
  ChartNoAxesCombined,
  ShieldCheck,
  ChevronRight,
  ArrowUpRight,
  X,
  ArrowLeft,
  Sun,
  Moon,
  CloudSun,
  Search,
} from "lucide-vue-next";
import type { Collection, RecordItem, Metric } from "@scene/domain";
type EChartsOption = InstanceType<typeof ScenicChart>["$props"]["option"];
import { scenario } from "../../../../scenario/config";
const props = defineProps<{
  terminal: "public" | "ops";
  introReady: boolean;
  records: Record<Collection, RecordItem[]>;
  figures: Metric[];
  dark: boolean;
  chart: EChartsOption;
  usageChart: EChartsOption;
}>();
const emit = defineEmits<{ navigate: [id: string]; theme: [] }>();
type Panel = "space" | "services" | "security" | "data" | "notices";
const view = ref<CommunityView>("housing");
const viewOptions = [
  { id: "housing" as const, label: "住房", icon: House },
  { id: "public" as const, label: "公共", icon: Trees },
  { id: "safety" as const, label: "安全", icon: ShieldCheck },
];
function changeView(next: CommunityView) {
  open.value = null;
  detail.value = null;
  view.value = next;
}
const root = ref<HTMLElement>(),
  open = ref<Panel | null>(null),
  tab = ref<Collection>("facilities"),
  query = ref(""),
  detail = ref<RecordItem | null>(null);
let trigger: HTMLElement | null = null;
const now = ref(new Date());
let ticker: ReturnType<typeof setInterval> | undefined;
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
const tabs = computed(() =>
  open.value === "space"
    ? (["facilities", "buildings"] as Collection[])
    : open.value === "services"
      ? ((props.terminal === "ops"
          ? ["tasks", "inspections", "parking"]
          : ["parking", "bookings"]) as Collection[])
      : open.value === "security"
        ? (["security"] as Collection[])
        : (["notices"] as Collection[]),
);
const rows = computed(() =>
  props.records[tab.value].filter((r) =>
    `${r.title} ${r.location} ${r.status}`.includes(query.value.trim()),
  ),
);
const titles: Record<Panel, string> = {
  space: "社区空间",
  services: props.terminal === "ops" ? "服务工单" : "生活服务",
  security: "安防事件",
  data: "运行数据",
  notices: "社区公告",
};
const buttons = computed(() => [
  { id: "space" as Panel, label: "空间", icon: Compass },
  {
    id: "services" as Panel,
    label: props.terminal === "ops" ? "服务工单" : "服务",
    icon: HeartHandshake,
  },
  ...(props.terminal === "ops"
    ? [{ id: "security" as Panel, label: "安防事件", icon: ShieldCheck }]
    : []),
  {
    id: "data" as Panel,
    label: props.terminal === "ops" ? "运行数据" : "概况",
    icon: ChartNoAxesCombined,
  },
]);
async function toggle(id: Panel, event: MouseEvent) {
  if (open.value === id) {
    close();
    return;
  }
  trigger = event.currentTarget as HTMLElement;
  open.value = id;
  query.value = "";
  detail.value = null;
  tab.value =
    id === "space"
      ? "facilities"
      : id === "services"
        ? props.terminal === "ops"
          ? "tasks"
          : "parking"
        : id === "security"
          ? "security"
          : "notices";
  await nextTick();
  root.value
    ?.querySelector<HTMLElement>(".stage-popover .bubble-close")
    ?.focus();
}
function close() {
  open.value = null;
  detail.value = null;
  trigger?.focus();
}
function outside(event: PointerEvent) {
  if (
    open.value &&
    !(event.target as Element).closest(
      ".stage-popover,.stage-dock,.stage-notice",
    )
  )
    close();
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    if (detail.value) detail.value = null;
    else close();
  }
}
onMounted(() => {
  ticker = setInterval(() => {
    now.value = new Date();
  }, 30000);
  // Markers stop bubbling; capture closes the previous menu before their selection handler.
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", keydown);
});
onBeforeUnmount(() => {
  clearInterval(ticker);
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", keydown);
});
function changeTab(id: Collection) {
  tab.value = id;
  query.value = "";
  detail.value = null;
}
</script>
<template>
  <section
    ref="root"
    class="community-stage"
    :class="{ 'bubble-open': open }"
    aria-label="云栖雅苑空间沙盘"
  >
    <div class="stage-landscape"><slot :view="view" /></div>
    <div
      class="stage-interface"
      :class="{ 'intro-hidden': !introReady }"
      :inert="!introReady"
      :aria-hidden="!introReady"
    >
      <header class="stage-header topbar">
        <GlassSurface
          class="stage-identity"
          :tint-opacity="0.09"
          :blur="6"
          :radius="22"
        >
          <div class="stage-logo">
            <Building2 :size="30" :stroke-width="1.3" />
          </div>
          <div>
            <p class="eyebrow">YUNQI · LIVING IN HARMONY</p>
            <h1>{{ scenario.name }}</h1>
            <p class="stage-subtitle">
              <span class="live-dot" />{{
                terminal === "ops" ? "社区运行监测" : "社区空间导览"
              }}<span>宜居 · 有序 · 安心</span>
            </p>
          </div>
        </GlassSurface>
        <GlassSurface
          class="stage-information"
          :tint-opacity="0.09"
          :blur="6"
          :radius="22"
        >
          <div class="stage-clock">
            <div>
              <strong>{{ time }}</strong
              ><small>{{ date }}</small>
            </div>
            <span class="stage-weather"
              ><CloudSun :size="27" :stroke-width="1.2" /><span
                >晴<strong>24°</strong></span
              ></span
            ><GlassButton
              :tint-opacity="0.06"
              :radius="99"
              :aria-label="dark ? '切换浅色' : '切换深色'"
              @click="emit('theme')"
              ><Sun v-if="dark" :size="17" /><Moon v-else :size="17"
            /></GlassButton>
          </div>
          <div class="stage-quick-stats">
            <div v-for="f in figures.slice(0, 2)" :key="f.label">
              <small>{{ f.label }}</small
              ><strong
                >{{ f.value }}<small>{{ f.unit }}</small></strong
              >
            </div>
          </div>
        </GlassSurface>
      </header>
      <div class="stage-notice">
        <GlassButton
          class="notice-pill"
          :variant="open === 'notices' ? 'primary' : 'transparent'"
          :tint-opacity="0.09"
          :blur="6"
          :radius="99"
          :aria-expanded="open === 'notices'"
          aria-controls="community-popover"
          @click="toggle('notices', $event)"
          ><Bell :size="17" /><span>{{
            records.notices[0]?.title ?? "暂无社区公告"
          }}</span
          ><span class="notice-count">{{ records.notices.length }}</span
          ><ChevronRight :size="15"
        /></GlassButton>
        <p>从一盏灯，到一座花园。</p>
      </div>
      <GlassSurface
        class="stage-dock"
        as="nav"
        aria-label="沙盘功能"
        :tint-opacity="0.09"
        :blur="6"
        :radius="24"
      >
        <GlassButton
          v-for="button in buttons"
          :key="button.id"
          :class="{ 'is-active': open === button.id }"
          :variant="open === button.id ? 'primary' : 'transparent'"
          :tint-opacity="0.09"
          :radius="17"
          :aria-expanded="open === button.id"
          aria-controls="community-popover"
          @click="toggle(button.id, $event)"
          ><component
            :is="button.icon"
            :size="25"
            :stroke-width="1.6" /><span>{{ button.label }}</span
          ><i
            v-if="button.id === 'services' && terminal === 'ops'"
            class="dock-dot"
        /></GlassButton>
        <span class="stage-dock-divider" aria-hidden="true" />
        <GlassButton
          v-for="option in viewOptions"
          :key="option.id"
          class="stage-view-button"
          :variant="view === option.id ? 'primary' : 'transparent'"
          :tint-opacity="0.09"
          :radius="17"
          :aria-pressed="view === option.id"
          @click="changeView(option.id)"
        >
          <component :is="option.icon" :size="25" :stroke-width="1.6" /><span>{{
            option.label
          }}</span>
        </GlassButton>
      </GlassSurface>
      <BubbleLeader
        v-if="open"
        :source="open === 'notices' ? '.notice-pill' : '.stage-dock .is-active'"
        target=".stage-popover"
      />
      <Transition name="stage-bubble">
        <GlassSurface
          v-if="open"
          id="community-popover"
          class="stage-popover"
          :class="[`bubble-${open}`, { 'has-detail': detail }]"
          :tint-opacity="0.24"
          :blur="8"
          :radius="24"
          role="dialog"
          :aria-label="titles[open]"
        >
          <header class="bubble-heading">
            <div>
              <p class="eyebrow">
                {{
                  open === "notices"
                    ? "COMMUNITY UPDATES"
                    : "EXPLORE THE COMMUNITY"
                }}
              </p>
              <h2>{{ detail?.title ?? titles[open] }}</h2>
            </div>
            <GlassButton
              class="bubble-close"
              :radius="99"
              :tint-opacity="0.06"
              aria-label="关闭气泡"
              @click="close"
              ><X :size="17"
            /></GlassButton>
          </header>
          <div v-if="detail" class="bubble-detail">
            <button class="bubble-back" @click="detail = null">
              <ArrowLeft :size="15" />返回列表
            </button>
            <p class="bubble-location">
              {{ detail.location }} · {{ detail.status }}
            </p>
            <p>{{ detail.description }}</p>
            <dl v-if="detail.capacity">
              <dt>总量 / 已使用</dt>
              <dd>{{ detail.capacity }} / {{ detail.used ?? 0 }}</dd>
            </dl>
            <p v-if="detail.result">{{ detail.result }}</p>
            <small>{{ detail.date }}</small>
          </div>
          <template v-else-if="open === 'data'">
            <div class="bubble-metrics">
              <div v-for="f in figures" :key="f.label">
                <small>{{ f.label }}</small
                ><strong
                  >{{ f.value }}<small>{{ f.unit }}</small></strong
                >
                <p>{{ f.note }}</p>
              </div>
            </div>
            <div v-if="terminal === 'ops'" class="bubble-trends">
              <h3>公共能耗趋势</h3>
              <ScenicChart :option="chart" label="公共能耗趋势" />
              <h3>停车使用趋势</h3>
              <ScenicChart :option="usageChart" label="停车使用趋势" />
            </div>
          </template>
          <template v-else>
            <div v-if="tabs.length > 1" class="bubble-tabs">
              <GlassButton
                v-for="id in tabs"
                :key="id"
                :aria-pressed="tab === id"
                :variant="tab === id ? 'primary' : 'transparent'"
                :tint-opacity="0.09"
                :radius="99"
                @click="changeTab(id)"
                >{{ scenario.labels[id] }}</GlassButton
              >
            </div>
            <label class="bubble-search"
              ><Search :size="16" /><input
                v-model="query"
                :aria-label="'搜索' + scenario.labels[tab]"
                placeholder="搜索名称或位置"
            /></label>
            <div class="bubble-records">
              <button
                v-for="item in rows"
                :key="item.id"
                @click="detail = item"
              >
                <span
                  ><strong>{{ item.title }}</strong
                  ><small>{{ item.location }} · {{ item.status }}</small></span
                ><ChevronRight :size="17" />
              </button>
              <p v-if="!rows.length" class="bubble-empty">暂时没有匹配的记录</p>
            </div>
            <button class="bubble-all" @click="emit('navigate', tab)">
              查看全部{{ scenario.labels[tab] }}<ArrowUpRight :size="16" />
            </button>
          </template>
        </GlassSurface>
      </Transition>
      <div class="stage-caption">
        <span class="vertical-rule" />云栖雅苑 · 空间浏览<small
          >拖动旋转 · 滚动缩放</small
        >
      </div>
    </div>
  </section>
</template>
<style scoped>
.stage-interface {
  display: contents;
}
.stage-interface > * {
  transition: opacity 0.6s;
}
.stage-interface.intro-hidden > * {
  opacity: 0;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .stage-interface > * {
    transition: none;
  }
}

.community-stage {
  position: relative;
  width: 100%;
  height: 100dvh;
  min-height: 580px;
  overflow: hidden;
  isolation: isolate;
}
.stage-landscape {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.stage-header.topbar {
  position: absolute;
  inset: 28px 32px auto;
  height: auto;
  border: 0;
  z-index: 5;
  align-items: flex-start;
  pointer-events: none;
}
.stage-header > * {
  pointer-events: auto;
}
.stage-identity {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 17px 22px;
}
.stage-logo {
  width: 51px;
  height: 62px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--brand) 32%, transparent);
  border-radius: 20px 20px 9px 9px;
  color: var(--brand);
}
.stage-identity h1 {
  font-size: 34px;
  letter-spacing: 0.12em;
  line-height: 1.3;
  margin: 2px 0 5px;
}
.stage-subtitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
}
.stage-subtitle > span:last-child {
  margin-left: 8px;
}
.stage-information {
  width: 287px;
  padding: 15px 18px;
}
.stage-clock {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.stage-clock > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.stage-clock strong {
  font-size: 27px;
  font-weight: 400;
  line-height: 1;
}
.stage-clock small {
  font-size: 10px;
  color: var(--muted);
}
.stage-clock button {
  padding: 8px;
  min-height: 34px;
}
.stage-weather {
  display: flex;
  gap: 8px;
  align-items: center;
  color: var(--muted);
}
.stage-weather > span {
  display: flex;
  flex-direction: column;
  font-size: 10px;
  gap: 3px;
}
.stage-weather strong {
  font-size: 22px;
  color: var(--ink);
}
.stage-quick-stats {
  border-top: 1px solid color-mix(in srgb, var(--brand) 12%, transparent);
  margin-top: 12px;
  padding-top: 11px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.stage-quick-stats > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.stage-quick-stats small {
  font-size: 10px;
  color: var(--muted);
}
.stage-quick-stats strong {
  font-size: 24px;
  font-weight: 400;
}
.stage-quick-stats strong small {
  margin-left: 6px;
}
.stage-notice {
  position: absolute;
  left: 32px;
  top: 161px;
  z-index: 5;
}
.notice-pill {
  min-height: 40px;
  padding: 9px 14px;
  font-size: 12px;
  gap: 9px;
}
.notice-count {
  font-size: 10px;
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  padding: 0 5px;
  border-radius: 20px;
}
.stage-notice > p {
  font-size: 10px;
  color: var(--muted);
  margin: 10px 15px;
  letter-spacing: 0.08em;
}
.stage-dock {
  position: absolute;
  bottom: 26px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 8;
  display: flex;
  gap: 6px;
  padding: 7px;
}
.stage-dock > button {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 93px;
  min-height: 66px;
  padding: 10px 17px;
  font-size: 12px;
}
.stage-dock .is-active {
  color: var(--brand);
}
.dock-dot {
  position: absolute;
  right: 19px;
  top: 10px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
}
.stage-popover {
  position: absolute;
  right: 32px;
  top: 220px;
  bottom: 126px;
  width: 350px;
  max-height: 560px;
  z-index: 9;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 14px 44px color-mix(in srgb, var(--ink) 9%, transparent);
}
.stage-popover.bubble-notices {
  left: 32px;
  right: auto;
  top: 224px;
  bottom: auto;
  max-height: calc(100% - 340px);
}
.bubble-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 16px;
}
.bubble-heading h2 {
  font-size: 22px;
  line-height: 1.4;
}
.bubble-heading .eyebrow {
  font-size: 8px;
  margin-bottom: 3px;
}
.bubble-close {
  padding: 7px;
  min-height: 32px;
  flex-shrink: 0;
}
.bubble-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.bubble-tabs button {
  padding: 5px 10px;
  min-height: 31px;
  font-size: 11px;
}
.bubble-tabs [aria-pressed="true"] {
  color: var(--brand);
}
.bubble-search {
  display: flex;
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid var(--line);
  padding: 6px 2px 10px;
  color: var(--muted);
}
.bubble-search input {
  background: transparent !important;
  border: 0 !important;
  border-radius: 0;
  outline: none;
  color: var(--ink);
  font-size: 12px;
  min-width: 0;
  width: 100%;
  padding: 0 !important;
}
.bubble-records {
  overflow: auto;
  min-height: 0;
  flex: 1;
}
.bubble-records > button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: transparent;
  padding: 15px 2px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 65%, transparent);
}
.bubble-records strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
}
.bubble-records small {
  display: block;
  font-size: 10px;
  color: var(--muted);
  margin-top: 5px;
}
.bubble-records button:hover {
  color: var(--brand);
}
.bubble-all {
  background: transparent;
  color: var(--brand);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 15px;
  padding: 4px 0;
}
.bubble-empty {
  padding: 20px 0;
  font-size: 12px;
  color: var(--muted);
}
.bubble-detail {
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-size: 14px;
  line-height: 1.8;
}
.bubble-back {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  color: var(--brand);
  font-size: 11px;
  padding: 0;
}
.bubble-location,
.bubble-detail small {
  font-size: 11px;
  color: var(--muted);
}
.bubble-detail dl {
  font-size: 12px;
}
.bubble-detail dd {
  margin: 0;
}
.bubble-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px 12px;
}
.bubble-metrics small {
  font-size: 10px;
  color: var(--muted);
}
.bubble-metrics strong {
  display: block;
  font-size: 27px;
  font-weight: 400;
  margin: 4px 0;
}
.bubble-metrics strong small {
  margin-left: 4px;
}
.bubble-metrics p {
  font-size: 10px;
  color: var(--muted);
}
.bubble-trends {
  overflow: auto;
  margin-top: 18px;
}
.bubble-trends h3 {
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
}
.bubble-trends :deep(.scenic-chart) {
  height: 160px;
}
.stage-caption {
  position: absolute;
  right: 32px;
  bottom: 38px;
  font-size: 10px;
  color: var(--muted);
}
.stage-caption small {
  display: block;
  font-size: 9px;
  margin-top: 5px;
}
.stage-bubble-enter-active,
.stage-bubble-leave-active {
  transition: opacity 0.18s ease;
}
.stage-bubble-enter-from,
.stage-bubble-leave-to {
  opacity: 0;
}
@media (max-width: 1100px) {
  .stage-header.topbar {
    inset: 20px 22px auto;
  }
  .stage-identity {
    padding: 13px 16px;
  }
  .stage-identity h1 {
    font-size: 29px;
  }
  .stage-information {
    width: 251px;
  }
  .stage-notice {
    left: 22px;
    top: 143px;
  }
  .stage-popover {
    right: 22px;
    top: 207px;
    width: 315px;
  }
  .stage-popover.bubble-notices {
    left: 22px;
    top: 205px;
  }
  .stage-caption {
    right: 22px;
  }
  .stage-dock {
    bottom: 20px;
  }
}
@media (max-height: 730px) {
  .stage-identity {
    padding: 12px 16px;
  }
  .stage-identity h1 {
    font-size: 28px;
  }
  .stage-logo {
    height: 52px;
  }
  .stage-notice {
    top: 143px;
  }
  .stage-popover {
    top: 198px;
    bottom: 110px;
  }
  .stage-popover.bubble-notices {
    top: 202px;
    max-height: calc(100% - 310px);
  }
  .stage-information {
    padding: 12px 16px;
  }
  .stage-quick-stats {
    margin-top: 9px;
    padding-top: 8px;
  }
}
@media (max-width: 650px) {
  .community-stage {
    min-height: 640px;
  }
  .stage-header.topbar {
    inset: 14px 14px auto;
    gap: 8px;
  }
  .stage-logo,
  .stage-subtitle > span:last-child,
  .stage-information .stage-quick-stats,
  .stage-weather {
    display: none;
  }
  .stage-identity {
    padding: 10px 12px;
  }
  .stage-identity .eyebrow {
    font-size: 7px;
  }
  .stage-identity h1 {
    font-size: 24px;
  }
  .stage-information {
    width: auto;
    padding: 12px;
  }
  .stage-clock strong {
    font-size: 22px;
  }
  .stage-clock {
    gap: 6px;
  }
  .stage-clock small {
    font-size: 8px;
  }
  .stage-notice {
    left: 14px;
    top: 125px;
  }
  .notice-pill {
    max-width: calc(100vw - 28px);
    font-size: 11px;
  }
  .stage-popover,
  .stage-popover.bubble-notices {
    left: 14px;
    right: 14px;
    top: 185px;
    bottom: 118px;
    width: auto;
    max-height: none;
  }
  .stage-dock > button {
    min-width: 67px;
    padding: 9px 11px;
  }
  .stage-caption {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .stage-bubble-enter-active,
  .stage-bubble-leave-active {
    transition: none;
  }
}
</style>
