<script setup lang="ts">
import { computed } from 'vue';
import { FileText, Download } from 'lucide-vue-next';
import ModalFrame from './ModalFrame.vue';
import { summarize, type MeasurementReport } from './engine';
const props=defineProps<{report:MeasurementReport}>();
const emit=defineEmits<{close:[];json:[]}>();
const stats=computed(()=>summarize(props.report.samples,props.report.elapsedMs));
const name=(id:string)=>props.report.system.endpoints.find(item=>item.id===id)?.name || id;
const unexecuted=computed(()=>props.report.system.endpoints.length-props.report.samples.filter(item=>item.outcome!=='cancelled').length);
</script>
<template>
  <ModalFrame title="API测试报告" wide @close="emit('close')">
    <div class="api-report-body">
      <header><FileText :size="30"/><div><h3>{{report.status==='completed'?'本次API执行已结束':'API测试阶段记录'}}</h3><p>{{report.system.name}} · {{report.id}}</p></div></header>
      <p>开始时间：{{new Date(report.startedAt).toLocaleString('zh-CN',{hour12:false})}} · 展示执行时长：{{(report.elapsedMs/1000).toFixed(2)}} 秒</p>
      <div class="report-kpis"><article><span>已执行</span><b>{{stats.count}}</b></article><article><span>通过</span><b>{{stats.passed}}</b></article><article><span>未通过</span><b>{{stats.failed}}</b></article><article><span>本快照未执行 / 取消</span><b>{{unexecuted}}</b></article></div>
      <p class="source">证据来源：本地契约模型，不发送真实业务测试请求。响应耗时为模型值，不代表真实服务测量。本报告是本次执行的独立快照；分组或单项执行不代表全部计划完成，最新工作记录与人工补充检查以综合验收报告为准。</p>
      <div class="report-table"><table><thead><tr><th>用例</th><th>HTTP</th><th>模型耗时</th><th>结论与断言</th></tr></thead><tbody><tr v-for="(item,index) in report.samples" :key="`${item.endpointId}-${index}`"><td>{{name(item.endpointId)}}<small>{{item.requestId}}</small></td><td>{{item.status==null?'—':item.status}}</td><td>{{item.outcome==='cancelled'?'—':`${item.elapsedMs.toFixed(1)} ms`}}</td><td><b>{{item.outcome==='passed'?'通过':item.outcome==='failed'?'未通过':'已取消'}}</b><small v-for="check in item.checks" :key="check.label">{{check.passed?'✓':'✕'}} {{check.label}}</small><small v-if="item.error">{{item.error}}</small></td></tr></tbody></table></div>
      <p>记录已自动保存，可在「验收报告 → 本轮原始执行报告」中重新查看或导出；关闭报告不会清除记录。</p>
    </div>
    <div class="dialog-footer"><button class="secondary" @click="emit('json')"><Download :size="14"/>导出API原始JSON</button><button class="primary" @click="emit('close')">返回测试工作区</button></div>
  </ModalFrame>
</template>
<style scoped>
.api-report-body{padding:24px;color:#355b40}.api-report-body header{display:flex;align-items:center;gap:14px}.api-report-body h3{font-size:21px}.api-report-body p{font-size:12px;line-height:1.9;margin:14px 0;overflow-wrap:anywhere;color:#819176}.report-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.report-kpis article{padding:16px;background:#f3f7ee;border-radius:9px}.report-kpis span{display:block;font-size:11px;color:#829576}.report-kpis b{display:block;font-size:26px;margin-top:8px}.source{background:#f5f8f0;padding:12px;border-radius:8px}.report-table{overflow:auto;max-height:420px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:12px;text-align:left;border-bottom:1px solid #e6eddf}th{position:sticky;top:0;background:#f5f8f0}td small{display:block;font-size:10px;line-height:1.8;color:#889a7c;overflow-wrap:anywhere}@media(max-width:700px){.report-kpis{grid-template-columns:1fr 1fr}.api-report-body{padding:16px}}
</style>
