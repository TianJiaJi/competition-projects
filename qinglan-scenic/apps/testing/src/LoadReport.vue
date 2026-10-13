<script setup lang="ts">
import { computed } from "vue";
import { ArrowDownToLine, Check, FileText, Gauge } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";
import TrendChart from "./TrendChart.vue";
import { loadReportSummary, type MeasurementReport } from "./engine";

const props = defineProps<{ report: MeasurementReport }>();
const emit = defineEmits<{ close: []; json: []; html: [] }>();
const summary = computed(() => loadReportSummary(props.report));
const stats = computed(() => summary.value.statistics);
const reachedStages = computed(() => summary.value.stages.filter(stage => stage.reached));
const format = (value: number, digits = 1) => value.toLocaleString("zh-CN", { maximumFractionDigits: digits });
const started = computed(() => new Date(props.report.startedAt).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }));
</script>

<template>
  <ModalFrame title="压力测试报告" wide @close="emit('close')">
    <div class="load-report-body">
      <div class="report-cover">
        <div class="report-cover-icon"><Gauge :size="28" /></div>
        <div>
          <div class="report-eyebrow">PERFORMANCE TEST REPORT</div>
          <h3>{{ report.status === 'completed' ? '本轮压力测试已完成' : '本轮阶段记录已保存' }}</h3>
          <p>{{ report.system.name }} · {{ summary.endpointName }}</p>
        </div>
        <span class="completion-tag">
          <Check :size="14" />{{ report.status === 'completed' ? '成果已归档' : '阶段记录' }}
        </span>
      </div>
      <div class="report-metadata">
        <span>编号 <b>{{ report.id.slice(0, 8).toUpperCase() }}</b></span>
        <span>开始 {{ started }}</span>
        <span>执行 {{ format(report.elapsedMs / 1000) }} / {{ report.config?.duration }} 秒</span>
        <code>GET {{ report.system.baseUrl }}{{ summary.endpointPath }}</code>
      </div>

      <section aria-label="负载统计">
        <div class="report-section-title"><h4>负载统计</h4><span>本轮数据汇总</span></div>
        <div class="report-kpis">
          <article><span>峰值并发</span><strong>{{ format(summary.peakConcurrency, 0) }}</strong><small>目标 {{ format(report.config?.concurrency || 0, 0) }}<template v-if="summary.reachedTarget"> · 已达目标</template></small></article>
          <article><span>累计完成请求</span><strong>{{ format(stats.count, 0) }}</strong><small>覆盖 {{ format(report.elapsedMs / 1000) }} 秒执行过程</small></article>
          <article><span>峰值吞吐</span><strong>{{ format(summary.peakRps) }}<em>req/s</em></strong><small>取本轮统计窗口峰值</small></article>
          <article><span>全程 P95</span><strong>{{ stats.count ? format(stats.p95) : '—' }}<em>ms</em></strong><small>P50 {{ format(stats.p50) }} · P99 {{ format(stats.p99) }} ms</small></article>
        </div>
        <div class="report-throughput">
          <span>平均吞吐 <b>{{ format(stats.rps) }}</b> req/s</span>
          <span>平均延迟 <b>{{ format(stats.average) }}</b> ms</span>
          <span>最长延迟 <b>{{ format(stats.max) }}</b> ms</span>
        </div>

      </section>

      <div class="report-chart-grid">
        <section><h4>负载与吞吐过程</h4><p class="report-chart-legend">绿色：展示并发 · 黄色：展示吞吐</p><TrendChart kind="load" :frames="report.frames" :events="report.events" :duration="report.config?.duration" :concurrency="report.config?.concurrency" :rps="Math.max(report.config?.rps || 0, summary.peakRps, 1)" label="报告负载与吞吐趋势" /></section>
        <section><h4>响应延迟过程</h4><p class="report-chart-legend">深绿：窗口 P50 · 浅绿：窗口 P95</p><TrendChart :frames="report.frames" :duration="report.config?.duration" label="报告响应延迟趋势" /></section>
      </div>

      <section>
        <div class="report-section-title"><h4>已记录的加压阶段</h4><span>自动 {{ report.events.filter(event => event.type === 'automatic').length }} 次 / 手动 {{ report.events.filter(event => event.type === 'manual').length }} 次加压</span></div>
        <div class="report-table-wrap"><table class="report-stage-table">
          <thead><tr><th>阶段</th><th>并发</th><th>峰值 req/s</th><th>最高窗口 P95</th><th>执行情况</th></tr></thead>
          <tbody><tr v-for="stage in reachedStages" :key="stage.level">
            <td>{{ stage.label }}</td><td>{{ format(stage.concurrency, 0) }}</td>
            <td>{{ format(stage.peakRps) }}</td><td>{{ stage.maxWindowP95 ? `${format(stage.maxWindowP95)} ms` : '—' }}</td>
            <td>已记录</td>
          </tr></tbody>
        </table></div>
      </section>

      <section class="report-outcomes" aria-label="本轮测试成果">
        <h4>本轮测试成果</h4>
        <ul>
          <li><Check :size="16" /><span><b>负载过程已记录</b>覆盖 {{ reachedStages.length }} 个阶段，峰值并发 {{ format(summary.peakConcurrency, 0) }}。</span></li>
          <li><Check :size="16" /><span><b>性能指标已汇总</b>累计 {{ format(stats.count, 0) }} 次完成请求，吞吐与延迟趋势已生成。</span></li>
          <li><Check :size="16" /><span><b>报告材料已整理</b>本轮配置、阶段数据和趋势图可随报告一起导出。</span></li>
        </ul>
      </section>
    </div>
    <div class="dialog-footer load-report-actions">
      <span>测试成果已保存于本次会话 · 原始记录可导出 JSON</span>
      <button class="secondary" @click="emit('json')"><ArrowDownToLine :size="15" />导出原始 JSON</button>
      <button class="primary" @click="emit('html')"><FileText :size="15" />下载 HTML 报告</button>
    </div>
  </ModalFrame>
</template>

<style scoped>
.load-report-body { overflow: auto; min-height: 0; padding: 24px 28px 28px; }
.report-cover { display: flex; align-items: center; gap: 16px; padding-bottom: 22px; }
.report-cover-icon { display: grid; place-items: center; width: 58px; height: 58px; border-radius: 16px; background: #eaf3e3; color: #5d8050; flex-shrink: 0; }
.report-eyebrow { font-size: 9px; letter-spacing: 1.8px; color: #84957c; margin-bottom: 8px; }
.report-cover h3 { font-size: 23px; font-weight: 500; color: #2d5540; margin-bottom: 8px; }
.report-cover p { color: #7c8d74; font-size: 12px; }
.completion-tag { margin-left: auto; display: flex; align-items: center; gap: 5px; white-space: nowrap; padding: 7px 11px; background: #edf5e5; color: #60834c; border-radius: 20px; font-size: 11px; }
.report-metadata { display: flex; gap: 10px 24px; flex-wrap: wrap; padding: 15px 0; border-block: 1px solid #e5ecdf; font-size: 11px; color: #7e8d76; }
.report-metadata b { font-family: var(--mono); color: #52654b; font-weight: 500; }
.report-metadata code { width: 100%; overflow-wrap: anywhere; font-size: 11px; }
.report-section-title { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 24px 0 14px; }
h4 { margin: 0; font-size: 14px; font-weight: 600; color: #3b6246; }
.report-section-title > span { font-size: 11px; color: #8a9b7e; }
.report-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.report-kpis article { background: #f5f8f1; border: 1px solid #e7edde; border-radius: 10px; padding: 16px; }
.report-kpis article > span { font-size: 11px; color: #7d9073; }
.report-kpis strong { display: block; color: #31583f; font: 29px var(--mono); margin: 13px 0 10px; }
.report-kpis em { font: 11px var(--mono); margin-left: 5px; color: #86987b; }
.report-kpis small { display: block; font-size: 10px; color: #8d9b83; line-height: 1.6; }
.report-throughput { display: flex; flex-wrap: wrap; gap: 12px 24px; margin-top: 16px; font-size: 11px; color: #839379; }
.report-throughput b { color: #526c49; font-family: var(--mono); }
.report-chart-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 24px; }
.report-chart-grid section { border: 1px solid #e5ecdf; border-radius: 10px; padding: 16px 0 6px; min-width: 0; }
.report-chart-grid h4, .report-chart-legend { margin-inline: 17px; }
.report-chart-legend { margin-block: 9px 3px; font-size: 10px; color: #839379; }
.report-table-wrap { overflow: auto; }
.report-stage-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; white-space: nowrap; }
.report-stage-table th { background: #f4f7f0; font-weight: 500; color: #7e9272; }
.report-stage-table th, .report-stage-table td { padding: 11px 14px; border-bottom: 1px solid #e8eee1; }
.report-stage-table td { color: #566e4c; font-variant-numeric: tabular-nums; }
.report-outcomes { margin-top: 24px; padding: 20px; border: 1px solid #dce8d3; background: #f4f8ef; border-radius: 10px; }
.report-outcomes ul { display: grid; gap: 15px; margin: 18px 0 0; padding: 0; list-style: none; }
.report-outcomes li { display: flex; align-items: flex-start; gap: 10px; color: #7d9073; font-size: 12px; line-height: 1.8; }
.report-outcomes svg { flex-shrink: 0; margin-top: 3px; color: #5d8050; }
.report-outcomes b { display: block; color: #3b6246; font-weight: 500; }
.load-report-actions { flex-shrink: 0; gap: 10px; }
.load-report-actions > span { margin-right: auto; }
@media (max-width: 700px) {
  .load-report-body { padding: 18px 16px; }
  .report-cover { flex-wrap: wrap; gap: 12px; }
  .report-cover h3 { font-size: 18px; }
  .report-cover-icon { width: 43px; height: 43px; }
  .completion-tag { margin-left: 0; }
  .report-kpis, .report-chart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .report-kpis article { padding: 12px; }
  .report-kpis strong { font-size: 25px; }
  .report-chart-grid { grid-template-columns: minmax(0, 1fr); }
  .report-section-title { align-items: flex-start; flex-wrap: wrap; }
  .load-report-actions { flex-wrap: wrap; padding: 14px 16px; }
  .load-report-actions > span { width: 100%; font-size: 10px; }
  .load-report-actions button { flex: 1; font-size: 11px; padding-inline: 9px; }
}
</style>
