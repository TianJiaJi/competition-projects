<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDownToLine, CheckCircle2, AlertCircle, FileText, Gauge, ArrowRight } from 'lucide-vue-next';
import ModalFrame from './ModalFrame.vue';
import TrendChart from './TrendChart.vue';
import { loadReportSummary, type MeasurementReport } from './engine';
const props=defineProps<{report:MeasurementReport}>();
const emit=defineEmits<{close:[];json:[];html:[];feedback:[]}>();
const summary=computed(()=>loadReportSummary(props.report));
const goal=computed(()=>summary.value.goal);
const stats=computed(()=>summary.value.statistics);
const stages=computed(()=>summary.value.stages.filter(stage=>stage.reached));
const format=(value:number,digits=1)=>value.toLocaleString('zh-CN',{maximumFractionDigits:digits});
const started=computed(()=>new Date(props.report.startedAt).toLocaleString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'}));
</script>
<template>
  <ModalFrame title="并发测试报告" wide @close="emit('close')">
    <div class="load-report-body">
      <header class="report-cover"><Gauge :size="28"/><div><small>CONCURRENCY GOAL / TEST REPORT</small><h3>本次并发目标验收</h3><p>{{report.system.name}} · {{summary.endpointName}} · 本地模型演示{{report.loadModel?'（含峰值随机波动）':''}}</p></div><span>{{goal.executionComplete?'完整测试已结束':'本轮未完整结束'}}</span></header>
      <section class="goal-verdict" :class="goal.verdict" aria-label="并发目标结论">
        <component :is="goal.verdict==='passed'?CheckCircle2:AlertCircle" :size="30"/>
        <div><h3>{{goal.verdictLabel}}</h3><p>{{goal.reason}}</p><small v-if="!goal.executionComplete">{{report.status==='stopped'?'本轮已提前停止':'尚未完成设定时长'}}；目标判定与测试完整性分开记录，仍需补齐测试时长才可完结任务。</small></div>
      </section>
      <section class="goal-kpis" aria-label="目标达成对比">
        <article><span>本次目标并发</span><strong>{{goal.targetConcurrency===null?'—':format(goal.targetConcurrency,0)}}</strong><small>来自本次报告保存的负载配置</small></article>
        <article><span>{{report.loadModel?'模型演示峰值并发':'已记录峰值并发'}}</span><strong>{{format(goal.peakConcurrency,0)}}</strong><small>仅计有效采样，不把计划升档当成达标</small></article>
        <article><span>目标达成率</span><strong>{{goal.achievementPercent===null?'—':format(goal.achievementPercent)}}<em v-if="goal.achievementPercent!==null">%</em></strong><small>峰值并发 ÷ 目标并发</small></article>
        <article><span>距离目标差额</span><strong>{{goal.gap===null?'—':format(goal.gap,0)}}</strong><small>{{goal.reachedTarget?'目标已达到，无并发缺口':'尚缺的并发数量'}}</small></article>
      </section>
      <div class="goal-progress" role="progressbar" aria-label="并发目标达成率" :aria-valuenow="Math.min(100,goal.achievementPercent || 0)" aria-valuemin="0" aria-valuemax="100"><i :class="goal.verdict" :style="{width:`${Math.min(100,goal.achievementPercent || 0)}%`}"/></div>
      <p class="judgement-rule">判定标准：有效采样峰值 ≥ 目标并发即为目标通过；没有有效采样时标记为待补测，不判为通过。吞吐和延迟用于辅助观察，不替代本次并发目标判定。<template v-if="report.loadModel"> 峰值阶段含{{report.loadModel.minOvershootPercent}}%–{{report.loadModel.maxOvershootPercent}}%正向随机演示波动，非实测数据。</template></p>
      <div class="report-metadata"><span>编号 {{report.id.slice(0,8).toUpperCase()}}</span><span>开始 {{started}}</span><span>执行 {{format(report.elapsedMs/1000)}} / {{report.config?.duration || '—'}} 秒</span><span>首次达标 {{goal.firstReachedSecond===null?'未达到':`${format(goal.firstReachedSecond)} s`}}</span><span>达标采样覆盖 {{goal.evidenceMode==='legacy-throughput-frames'?'旧记录未统计':`${format(goal.targetWindowSeconds)} 秒`}}</span><code>{{summary.endpointMethod}} {{report.system.baseUrl}}{{summary.endpointPath}}</code></div>
      <section class="goal-issues" :class="{failed:goal.issues.length}" aria-label="并发目标问题与反馈">
        <h4>{{goal.issues.length?'未达标问题 · 已记录':'目标问题记录'}}</h4>
        <ul v-if="goal.issues.length"><li v-for="issue in goal.issues" :key="issue">{{issue}}</li></ul>
        <p v-else>{{goal.verdict==='passed'?'本次并发目标无缺口。':'证据不足，需保持原目标重新测试，不形成虚假的通过结论。'}}</p>
        <p v-if="stats.failed">另有 {{format(stats.failed,0)}} 次请求契约未通过，独立纳入验收问题，不隐藏在目标通过结论中。</p>
        <p v-if="goal.issues.length">该问题随本轮原始报告保存，汇总验收报告后纳入问题清单，再由操作者手动提交反馈。本地反馈不代表交付团队实际收到。</p>
        <button v-if="goal.issues.length" class="text-button" @click="emit('close');emit('feedback')">前往汇总与反馈<ArrowRight :size="14"/></button>
      </section>
      <section class="supporting-metrics" aria-label="辅助性能指标"><h4>辅助指标（不替代并发目标结论）</h4><div><span>累计完成请求 <b>{{format(stats.count,0)}}</b></span><span>请求契约未通过 <b>{{format(stats.failed,0)}}</b></span><span>峰值吞吐 <b>{{format(summary.peakRps)}}</b> req/s</span><span>全程 P95 <b>{{stats.count?format(stats.p95):'—'}}</b> ms</span></div></section>
      <div class="report-chart-grid"><section><h4>并发目标与负载过程</h4><p>绿色：记录并发 · 黄色：吞吐 · 虚线目标 {{goal.targetConcurrency || '—'}}</p><TrendChart kind="load" show-target :frames="report.frames" :events="report.events" :duration="report.config?.duration" :concurrency="report.config?.concurrency" :rps="Math.max(report.config?.rps || 0,summary.peakRps,1)" label="报告负载与吞吐趋势"/></section><section><h4>响应延迟过程</h4><p>辅助观察模型延迟变化</p><TrendChart :frames="report.frames" :duration="report.config?.duration" label="报告响应延迟趋势"/></section></div>
      <section class="report-stages"><h4>加压过程记录</h4><div class="report-table-wrap"><table><thead><tr><th>阶段</th><th>计划 / 记录并发</th><th>峰值 req/s</th><th>最高窗口 P95</th></tr></thead><tbody><tr v-for="stage in stages" :key="stage.level"><td>{{stage.label}}</td><td>{{format(stage.concurrency,0)}}</td><td>{{format(stage.peakRps)}}</td><td>{{stage.maxWindowP95?`${format(stage.maxWindowP95)} ms`:'—'}}</td></tr></tbody></table></div><p>阶段表包含计划升档记录；目标结论只依据有效采样窗口。{{goal.evidenceMode==='legacy-throughput-frames'?'旧报告缺少窗口元数据，使用有吞吐记录的帧核验。':''}}</p></section>
      <p class="report-source">{{goal.measurement}}</p>
    </div>
    <div class="dialog-footer load-report-actions"><span>目标结论、差额与问题随报告一并导出</span><button class="secondary" @click="emit('json')"><ArrowDownToLine :size="15"/>导出原始 JSON</button><button class="primary" @click="emit('html')"><FileText :size="15"/>下载 HTML 报告</button></div>
  </ModalFrame>
</template>
<style scoped>
.load-report-body{overflow:auto;min-height:0;padding:24px 28px;color:#365b40}.report-cover{display:flex;align-items:center;gap:14px;margin-bottom:20px}.report-cover small{font-size:9px;letter-spacing:1.2px;color:#89977d}.report-cover h3{font-size:22px;margin:6px 0}.report-cover p{font-size:12px;color:#85967a}.report-cover>span{margin-left:auto;font-size:11px;color:#89977d;white-space:nowrap}
.goal-verdict{display:flex;align-items:flex-start;gap:13px;padding:20px;border:1px solid #e2d4ad;border-radius:12px;background:#fff8e8;color:#96713a}.goal-verdict.passed{background:#eaf5e7;border-color:#bfd9b5;color:#356e43}.goal-verdict.failed{background:#fff0ea;border-color:#e8b9a8;color:#a84e35}.goal-verdict h3{font-size:23px}.goal-verdict p{font-size:13px;margin-top:10px;line-height:1.8}.goal-verdict small{display:block;font-size:11px;line-height:1.8;margin-top:8px}
.goal-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:18px}.goal-kpis article{padding:16px;border:1px solid #e3ebdc;border-radius:9px;background:#f6f9f2}.goal-kpis span{font-size:11px;color:#7e9273}.goal-kpis strong{display:block;font:30px var(--mono);margin:12px 0}.goal-kpis em{font-size:14px;font-style:normal}.goal-kpis small{font-size:10px;line-height:1.8;color:#8b9b80}
.goal-progress{height:7px;overflow:hidden;border-radius:5px;background:#eaf0e5;margin-top:16px}.goal-progress i{display:block;height:100%;background:#ba974e}.goal-progress .passed{background:#589363}.goal-progress .failed{background:#cd8164}.judgement-rule,.report-source{font-size:11px;line-height:1.9;color:#8b9b81;margin:12px 0}.report-metadata{display:flex;flex-wrap:wrap;gap:12px 20px;padding:15px 0;border-block:1px solid #e3ebdc;font-size:11px;color:#819475}.report-metadata code{width:100%;overflow-wrap:anywhere}
h4{font-size:14px}.goal-issues{padding:17px;margin-top:20px;border:1px solid #e3ebdc;background:#f7faf3;border-radius:9px}.goal-issues.failed{border-color:#ead0bd;background:#fff8ef}.goal-issues p,.goal-issues li{font-size:12px;line-height:1.9;margin-top:8px}.goal-issues ul{padding-left:18px}.supporting-metrics{margin-top:22px}.supporting-metrics>div{display:flex;flex-wrap:wrap;gap:12px 24px;font-size:11px;color:#839775;margin-top:14px}.supporting-metrics b{font-family:var(--mono);color:#3f6b48}.report-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:24px}.report-chart-grid section{min-width:0;border:1px solid #e3ebdc;border-radius:9px;padding:16px 0 6px}.report-chart-grid h4,.report-chart-grid p{margin-inline:16px}.report-chart-grid p,.report-stages p{font-size:10px;color:#8c9e7e;line-height:1.8;margin-top:8px}.report-stages{margin-top:24px}.report-table-wrap{overflow:auto;margin-top:12px}table{width:100%;border-collapse:collapse;font-size:12px;text-align:left;white-space:nowrap}th,td{padding:11px 14px;border-bottom:1px solid #e5eddf}th{background:#f4f8ef;color:#879b7a;font-weight:500}.load-report-actions>span{margin-right:auto;font-size:10px;color:#8a9a7e}
@media(max-width:700px){.load-report-body{padding:18px 16px}.report-cover{flex-wrap:wrap}.report-cover>span{margin-left:0}.goal-verdict{padding:16px}.goal-verdict h3{font-size:19px}.goal-kpis{grid-template-columns:1fr 1fr;gap:8px}.goal-kpis strong{font-size:25px}.report-chart-grid{grid-template-columns:1fr}.load-report-actions{flex-wrap:wrap}.load-report-actions>span{width:100%}}
</style>
