<script setup lang="ts">
import { computed } from "vue";
import { ArrowDownToLine, CheckCheck, FileText, ShieldCheck } from "lucide-vue-next";
import ModalFrame from "./ModalFrame.vue";
import { businessMetrics, definition, specialSummary, type SpecialReport } from "./special-engine";
const props = defineProps<{ report: SpecialReport }>();
const emit = defineEmits<{ close: []; json: []; html: [] }>();
const summary = computed(() => specialSummary(props.report));
const time = (at: string) => new Date(at).toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" });
</script>
<template>
  <ModalFrame title="专项验收报告" wide @close="emit('close')">
    <div class="special-report-body">
      <div class="special-report-cover"><ShieldCheck :size="35" /><div><small>SPECIAL VERIFICATION REPORT</small><h3>{{ summary.completed === summary.total ? `${summary.total} 项专项验证已完成` : `已核验 ${summary.completed} 项专项场景` }}</h3><p>{{ report.system.name }} · {{ report.id.slice(0, 8).toUpperCase() }} · {{ time(report.generatedAt) }}</p></div></div>
      <div class="special-report-kpis"><article><span>已核验场景</span><strong>{{ summary.completed }}<small> / {{ summary.total }}</small></strong></article><article><span>断言通过</span><strong>{{ summary.passed }}<small> / {{ summary.assertions }}</small></strong></article><article><span>运行记录</span><strong>{{ summary.events }}<small> 条</small></strong></article><article><span>累计执行</span><strong>{{ (report.elapsedMs / 1000).toFixed(1) }}<small> 秒</small></strong></article></div>
      <section v-for="run in summary.verified" :key="run.id" class="special-report-case">
        <header><h4><CheckCheck :size="18" />{{ definition(run.scenarioId,run.profile).name }}</h4><span>{{ run.assertions.every(check => check.passed) ? '验证通过' : '记录待复核' }}</span></header>
        <p>{{ definition(run.scenarioId,run.profile).parameter }}：{{ definition(run.scenarioId,run.profile).options.find(option => option.value === run.parameter)?.label }} · {{ run.requests.length }} 次操作</p>
        <div class="special-report-facts"><span v-for="metric in businessMetrics(run)" :key="metric.label">{{ metric.label }} <b>{{ metric.value }}</b></span></div>
        <div class="special-report-table"><table><thead><tr><th>核验项目</th><th>预期值</th><th>记录值</th><th>结论</th></tr></thead><tbody><tr v-for="check in run.assertions" :key="check.label"><td>{{ check.label }}</td><td>{{ check.expected }}</td><td>{{ check.actual }}</td><td>{{ check.passed ? '通过' : '待复核' }}</td></tr></tbody></table></div>
        <details><summary>查看 {{ run.events.length }} 条处理证据</summary><div class="special-report-table"><table><thead><tr><th>请求编号</th><th>执行账户</th><th>处理结果</th></tr></thead><tbody><tr v-for="event in run.events" :key="event.id"><td>{{ event.requestId }}</td><td>{{ event.actor }}</td><td>{{ event.result }}</td></tr></tbody></table></div></details>
      </section>
      <p class="special-report-note">报告保留本轮参数、处理顺序与核验依据。完整状态快照和请求输入、响应可通过 JSON 导出。</p>
    </div>
    <div class="dialog-footer special-report-actions"><span>证据来源：本地场景引擎，不连接校园业务服务</span><button class="secondary" @click="emit('json')"><ArrowDownToLine :size="15" />导出原始 JSON</button><button class="primary" @click="emit('html')"><FileText :size="15" />下载 HTML 报告</button></div>
  </ModalFrame>
</template>
<style scoped>
.special-report-body { overflow: auto; min-height: 0; padding: 25px 28px; }.special-report-cover { display: flex; gap: 20px; align-items: center; color: #4a7954; padding-bottom: 24px; }.special-report-cover small { color: #92a284; font-size: 9px; letter-spacing: 1.8px; }.special-report-cover h3 { margin: 8px 0; font-size: 24px; font-weight: 500; color: #305d43; }.special-report-cover p { color: #849677; font-size: 11px; }
.special-report-kpis { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; }.special-report-kpis article { background: #f2f7ec; border: 1px solid #e0ead8; padding: 17px; border-radius: 10px; }.special-report-kpis span { color: #829875; font-size: 11px; }.special-report-kpis strong { display: block; color: #356448; font: 30px var(--mono); margin-top: 12px; }.special-report-kpis small { font-size: 12px; color: #8ca27c; }
.special-report-case { margin-top: 23px; padding: 20px; border: 1px solid #e0e8d9; border-radius: 10px; }.special-report-case header { display: flex; justify-content: space-between; align-items: center; gap: 15px; }.special-report-case h4 { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500; color: #346147; margin: 0; }.special-report-case header > span { color: #678b55; background: #eff6e7; padding: 5px 10px; border-radius: 20px; font-size: 10px; }.special-report-case p { color: #8a9b7d; font-size: 11px; margin-top: 12px; }
.special-report-facts { display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 16px 0; color: #819574; font-size: 12px; }.special-report-facts b { color: #416d44; font-family: var(--mono); }.special-report-table { overflow: auto; }table { width: 100%; border-collapse: collapse; text-align: left; font-size: 11px; white-space: nowrap; }th { font-weight: 500; background: #f5f8f0; }th,td { padding: 10px 12px; border-bottom: 1px solid #e5ecdf; color: #6e8562; }summary { font-size: 11px; color: #7a9568; cursor: pointer; margin-top: 15px; }details[open] summary { margin-bottom: 12px; }.special-report-note { margin-top: 22px; color: #93a187; font-size: 11px; line-height: 1.8; }.special-report-actions { flex-shrink: 0; gap: 10px; }.special-report-actions > span { margin-right: auto; }
@media(max-width:700px) { .special-report-body { padding: 18px 16px; }.special-report-kpis { grid-template-columns: repeat(2,minmax(0,1fr)); }.special-report-cover h3 { font-size: 19px; }.special-report-cover { gap: 12px; }.special-report-cover > svg { flex-shrink: 0; }.special-report-cover p { line-height: 1.8; }.special-report-case { padding: 14px; }.special-report-actions { flex-wrap: wrap; padding-inline: 16px; }.special-report-actions > span { width: 100%; }.special-report-actions button { flex: 1; font-size: 11px; } }
</style>
