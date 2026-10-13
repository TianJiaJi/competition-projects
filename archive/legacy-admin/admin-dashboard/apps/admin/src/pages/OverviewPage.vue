<script setup lang="ts">
import {useLiveRefresh} from "../app/live-refresh";
useLiveRefresh(()=>load());
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowUpRight, CarFront, Footprints, RefreshCw } from "lucide-vue-next";
import { LiquidGlassButton, LiquidGlassSurface } from "@scenic/ui/liquid-glass";
import { getOverview, type OverviewMetrics } from "../services/orders";
import { listReports } from "../services/chat";
import { severityLabels } from "../services/alerts";
import AsyncSection from "../components/AsyncSection.vue";
import StatusTag from "../components/StatusTag.vue";

const notes = ref<HTMLDetailsElement | null>(null);
const metrics = ref<OverviewMetrics | null>(null);
const pendingReports = ref<Array<{ id: string; roomName: string; messagePreview: string }>>([]);
const reportTotal = ref<number | null>(null);
const loading = ref(false);
const reportsLoading = ref(false);
const refreshing = computed(() => loading.value || reportsLoading.value);
const error = ref<string | null>(null);
const reportsError = ref<string | null>(null);

async function loadMetrics(): Promise<void> {
  error.value = null;
  try {
    const result = await getOverview();
    if (result.ok) metrics.value = result.data;
    else error.value = result.error.message;
  } catch {
    error.value = "预约与告警数据暂时无法读取，请重试。";
  }
}

async function loadReports(): Promise<void> {
  if (reportsLoading.value) return;
  reportsLoading.value = true;
  reportsError.value = null;
  try {
    const result = await listReports({ status: "pending", pageSize: 20 });
    if (result.ok) {
      pendingReports.value = result.data.items.slice(0, 1).map(report => ({
        id: report.id, roomName: report.roomName, messagePreview: report.messagePreview,
      }));
      reportTotal.value = result.data.total;
    } else reportsError.value = result.error.message;
  } catch {
    reportsError.value = "举报数据暂时无法读取，请重试。";
  } finally {
    reportsLoading.value = false;
  }
}

async function load(): Promise<void> {
  if (loading.value || reportsLoading.value) return;
  loading.value = true;
  try {
    await Promise.all([loadMetrics(), loadReports()]);
  } finally {
    loading.value = false;
  }
}

function closeNotes(): void {
  if (!notes.value?.open) return;
  notes.value.open = false;
  notes.value.querySelector('summary')?.focus();
}
function onOutsideNotes(event: PointerEvent): void {
  if (notes.value?.open && event.target instanceof Node && !notes.value.contains(event.target)) notes.value.open = false;
}
onMounted(() => { void load(); document.addEventListener('pointerdown', onOutsideNotes); });
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsideNotes));
function go(to: string): void { window.location.hash = `#${to}`; }
const dateText = computed(() => metrics.value?.businessDate ?? "");
const reportCount = computed(() => reportTotal.value ?? metrics.value?.pendingReportCount ?? "未知");
</script>

<template>
  <section class="overview">
    <div class="overview__layout">
      <header class="overview__header">
        <div class="overview__heading">
          <h1>工作台</h1>
          <span v-if="dateText" class="overview__date">统计日期 <time :datetime="dateText">{{ dateText }}</time></span>
        </div>
        <div class="overview__actions">
          <details ref="notes" class="overview__notes" @keydown.esc.prevent.stop="closeNotes">
            <LiquidGlassSurface as="summary" :radius="14" :tint-opacity="0.08">数据说明</LiquidGlassSurface>
            <LiquidGlassSurface class="overview__notes-panel" :radius="18" :blur="8" :tint-opacity="0.94" role="region" aria-label="数据说明">
              <h2>统计口径</h2>
              <p>告警包含待处理和处理中的记录，按紧急程度优先、同级发生时间由近到远展示前 5 条。</p>
              <p>预约按所示统计日期汇总，包含现场记录与批次预约，已入园或已进场的预约也计入；不代表实时在园人数或停车占用量。</p>
              <p>举报显示待处理总数和一条摘要，其余内容可进入聊天管理查看。</p>
              <p>刷新会重新读取已保存的数据；失败时明确提示，并保留上次读取的内容。</p>
            </LiquidGlassSurface>
          </details>
          <LiquidGlassButton class="overview__refresh" type="button" title="刷新工作台数据" :radius="14" :disabled="refreshing" :aria-busy="refreshing || undefined" @click="load">
            <RefreshCw :size="18" :class="{ 'overview__refresh-icon--busy': refreshing }" aria-hidden="true" />
            <span class="overview__refresh-label">{{ refreshing ? '刷新中' : '刷新' }}</span>
          </LiquidGlassButton>
        </div>
      </header>

      <div v-if="error && metrics" class="overview__error" role="alert">
        <strong>刷新失败，当前展示上次读取的数据。</strong>
        <span>{{ error }}</span>
        <LiquidGlassButton variant="transparent" type="button" class="overview__text-action" :disabled="loading || reportsLoading" @click="load">重新读取</LiquidGlassButton>
      </div>
      <AsyncSection :loading="loading && !metrics" :error="!metrics ? error ?? undefined : undefined" @retry="load">
        <template v-if="metrics">
          <div class="overview__grid overview__tasks">
            <LiquidGlassSurface as="section" class="overview__task overview__task--primary overview__wide" :radius="22" :blur="2" :tint-opacity="0.16" aria-labelledby="overview-alerts-title">
              <header class="overview__task-header">
                <div class="overview__alert-heading"><h2 id="overview-alerts-title">优先关注的告警</h2><p class="overview__meta">待处理与处理中 · 紧急告警优先</p></div>
                <LiquidGlassButton variant="transparent" class="overview__count" type="button" aria-label="未完成告警（待处理 + 处理中）" @click="go('/alerts?scope=current')"><span class="num">{{ metrics.pendingAlertCount }}</span><span>项</span><ArrowUpRight :size="18" aria-hidden="true" /></LiquidGlassButton>
              </header>
              <ul v-if="metrics.latestAlerts.length" class="overview__list overview__alerts">
                <li v-for="alert in metrics.latestAlerts" :key="alert.id" class="overview__alert-row">
                  <div class="overview__item-copy">
                    <span>{{ alert.title }}</span>
                    <span class="overview__meta">{{ alert.location }} · {{ alert.startedAt.slice(11, 16) }}</span>
                  </div>
                  <StatusTag :label="severityLabels[alert.severity as keyof typeof severityLabels] ?? alert.severity" :tone="alert.severity === 'critical' ? 'danger' : alert.severity === 'important' ? 'warning' : 'info'" />
                </li>
              </ul>
              <p v-else class="overview__empty">当前没有未完成告警。</p>
              <LiquidGlassButton variant="transparent" type="button" class="overview__text-action" @click="go('/alerts?scope=current')">查看全部当前告警 <ArrowUpRight :size="18" aria-hidden="true" /></LiquidGlassButton>
            </LiquidGlassSurface>

            <aside class="overview__side overview__narrow" aria-label="预约概况与举报">
              <div class="overview__metrics" :aria-busy="loading">
                <LiquidGlassButton
                  class="overview__metric overview__metric--admission"
                  :radius="22" :blur="2" :tint-opacity="0.16"
                  @click="go(`/orders?date=${dateText}&type=admission&source=all&reservationStatus=confirmed`)"
                >
                  <span class="overview__metric-top"><span>当日有效入园预约人数</span><Footprints :size="26" aria-hidden="true" /></span>
                  <span class="overview__number"><strong class="num">{{ metrics.admissionPeople.toLocaleString('zh-CN') }}</strong><span>人</span></span>
                </LiquidGlassButton>
                <LiquidGlassButton
                  class="overview__metric overview__metric--parking"
                  :radius="22" :blur="2" :tint-opacity="0.16"
                  @click="go(`/orders?date=${dateText}&type=parking&source=all&reservationStatus=confirmed`)"
                >
                  <span class="overview__metric-top"><span>当日有效停车预约辆数</span><CarFront :size="26" aria-hidden="true" /></span>
                  <span class="overview__number"><strong class="num">{{ metrics.parkingVehicles.toLocaleString('zh-CN') }}</strong><span>辆</span></span>
                </LiquidGlassButton>
              </div>
              <LiquidGlassSurface as="section" class="overview__task" :radius="22" :blur="2" :tint-opacity="0.16" aria-labelledby="overview-reports-title" :aria-busy="reportsLoading">
                <header class="overview__task-header">
                  <h2 id="overview-reports-title">待处理举报</h2>
                  <LiquidGlassButton variant="transparent" class="overview__count" type="button" aria-label="待处理举报" @click="go('/chat?tab=reports')"><span class="num">{{ reportCount }}</span><span>条</span><ArrowUpRight :size="18" aria-hidden="true" /></LiquidGlassButton>
                </header>
                <p v-if="reportsLoading" class="overview__meta" role="status">正在读取举报…</p>
                <div v-if="reportsError" class="overview__error" role="alert">
                  <strong>{{ reportTotal === null ? '举报读取失败' : '举报刷新失败，保留上次读取的数据。' }}</strong>
                  <span>{{ reportsError }}</span>
                  <LiquidGlassButton variant="transparent" class="overview__text-action" type="button" :disabled="reportsLoading || loading" @click="loadReports">重试举报</LiquidGlassButton>
                </div>
                <ul v-if="pendingReports.length" class="overview__list overview__reports">
                  <li v-for="report in pendingReports" :key="report.id" class="overview__item-copy">
                    <span>{{ report.roomName }}</span>
                    <p class="overview__report-preview">{{ report.messagePreview }}</p>
                  </li>
                </ul>
                <p v-else-if="!reportsError && !reportsLoading && reportTotal !== null" class="overview__empty">当前没有待处理举报。</p>
                <LiquidGlassButton variant="transparent" type="button" class="overview__text-action" @click="go('/chat?tab=reports')">前往聊天管理 <ArrowUpRight :size="18" aria-hidden="true" /></LiquidGlassButton>
              </LiquidGlassSurface>
            </aside>
          </div>

        </template>
      </AsyncSection>
    </div>
  </section>
</template>

<style scoped>
.overview { width: 100%; max-width: 1312px; margin: 0 auto; padding: 0 8px 8px; container-type: inline-size; }
.overview__layout { display: flex; flex-direction: column; gap: 16px; }
.overview__header, .overview__heading, .overview__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 24px; }
.overview__refresh.liquid-glass-button { gap: 8px; min-height: 48px; min-width: 112px; padding: 10px 16px; font-size: var(--admin-font-small); white-space: nowrap; }
.overview__refresh-label { min-width: 3em; text-align: center; }
.overview__refresh-icon--busy { animation: admin-spin .8s linear infinite; }
@media (prefers-reduced-motion: reduce) { .overview__refresh-icon--busy { animation: none; } }
.overview__header { position: relative; z-index: 2; justify-content: space-between; }
.overview__heading h1 { font: 600 var(--admin-font-display)/1.3 var(--serif); }
.overview__date, .overview__meta { font-size: var(--admin-font-small); color: var(--muted); }
.overview__date { display: flex; gap: 10px; }
.overview__grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 20px; align-items: start; }
.overview__wide { grid-column: span 8; }
.overview__narrow { grid-column: span 4; }
.overview__side, .overview__metrics { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.overview__metric.liquid-glass-button { min-width: 0; width: 100%; min-height: 220px; padding: 32px; display: flex; flex-direction: column; align-items: stretch; justify-content: space-between; gap: 8px; text-align: left; }
.overview__metric-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: var(--admin-font-body); }
.overview__metric-top > span { min-width: 0; }
.overview__metric-top > svg { flex-shrink: 0; color: #54796e; }
.overview__number { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px; }
.overview__number strong { font-size: 56px; font-weight: 500; line-height: 1.05; letter-spacing: -.04em; overflow-wrap: anywhere; }
.overview__number > span { font-size: var(--admin-font-body); color: var(--muted); }
.overview__metric--parking .overview__number strong { font-size: 48px; }
.overview__task { min-width: 0; padding: 32px; font-weight: 400; }
.overview__task-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.overview__task-header h2 { font-size: var(--admin-font-section); line-height: 1.4; }
.overview__alert-heading { flex: 1; min-width: 0; }
.overview__alert-heading .overview__meta { margin: 6px 0 0; }
.overview__task--primary .overview__count > .num { font-size: 72px; line-height: 1; }
.overview__count { display: inline-flex; align-items: baseline; gap: 6px; min-height: 40px;  padding: 0;  color: var(--brand); }
.overview__count > .num { font-size: var(--admin-font-section); }
.overview__count > span:not(.num) { font-size: var(--admin-font-small); }
.overview__list { list-style: none; padding: 0; margin: 0 0 12px; }
.overview__list > li { padding: 24px 0; border-bottom: 1px solid rgb(25 59 53 / .12); }
.overview__alert-row { display: flex; align-items: start; justify-content: space-between; gap: 16px; }
.overview__alert-row > .tag { flex-shrink: 0; }
.overview__item-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
.overview__alerts .overview__item-copy > span:first-child { font-size: 20px; font-weight: 600; }
.overview__report-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; margin: 0; font-size: var(--admin-font-small); color: var(--muted); line-height: 1.5; }
.overview__text-action { display: inline-flex; align-items: center; gap: 8px; padding: 8px 0; min-height: 40px;   color: var(--brand); font-size: var(--admin-font-small); text-align: left; }
.overview__text-action:disabled { opacity: .6; }
.overview__empty { color: var(--muted); margin: 16px 0; }
.overview__error { display: flex; flex-direction: column; align-items: start; gap: 8px; padding: 16px; border-radius: 14px; background: var(--admin-danger-bg); color: var(--admin-danger); font-size: var(--admin-font-small); overflow-wrap: anywhere; margin-bottom: 12px; }
.overview__notes { position: relative; font-size: var(--admin-font-small); }
.overview__notes summary { cursor: pointer; padding: 10px 12px; color: var(--muted); }
.overview__notes-panel { --glass-tint-rgb: 230 242 235; --glass-text-color: #193b35; position: absolute; top: calc(100% + 12px); right: 0; width: min(520px, calc(100vw - 48px)); max-height: min(520px, calc(100dvh - 200px)); overflow-y: auto; padding: 24px; }
.overview__notes-panel h2 { font-size: var(--admin-font-section); }
.overview__notes-panel p { margin: 16px 0 0; line-height: 1.65; }
/* 矮屏只收紧间距，不缩小业务文字和数字。 */
@media (max-height: 950px) {
  .overview__metric.liquid-glass-button { min-height: 160px; padding: 20px 24px; }
  .overview__task { padding: 24px; }
  .overview__list > li { padding: 8px 0; }
}
@container (max-width: 899px) {
  .overview__wide, .overview__narrow { grid-column: 1 / -1; }
}
</style>
