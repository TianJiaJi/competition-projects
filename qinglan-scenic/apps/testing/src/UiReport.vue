<script setup lang="ts">
import { Download, CheckCircle2, AlertCircle } from 'lucide-vue-next';
import ModalFrame from './ModalFrame.vue';
import { campusProject } from './campus-handoff';
import type { UiReport } from './ui-report';
defineProps<{report:UiReport}>();
const emit=defineEmits<{close:[];json:[]}>();
</script>
<template><ModalFrame title="UI测试报告" wide @close="emit('close')"><div class="ui-report-body"><div class="ui-report-summary"><CheckCircle2 v-if="!report.issues" :size="30"/><AlertCircle v-else :size="30"/><div><h3>五端页面检查已完成</h3><p>{{report.passed}} 项通过 · {{report.issues}} 项需整改 · 共 {{report.total}} 项</p><small>{{new Date(report.at).toLocaleString('zh-CN',{hour12:false})}} · {{report.taskId}}</small></div><button class="secondary" @click="emit('json')"><Download :size="15"/>导出UI报告JSON</button></div><p class="ui-report-source">来源：人工观察与确认。批量确认不会执行自动UI测试，需整改项已原样保留。</p><section v-for="page in campusProject.pages" :key="page.id"><h4>{{page.name}}</h4><article v-for="check in report.checks.filter(c=>c.pageId===page.id)" :key="check.index"><span>{{page.checks[check.index]}}</span><b class="badge" :class="check.result==='issue'?'issue':'good'">{{check.result==='issue'?'需整改':'通过'}}</b><p v-if="check.note">{{check.note}}</p></article></section></div></ModalFrame></template>
<style scoped>
.ui-report-body { overflow:auto; padding:24px; color:#36583f; }
.ui-report-summary { display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.ui-report-summary h3 { font-size:19px; }.ui-report-summary p { margin:10px 0; font-size:13px; }.ui-report-summary small { font-size:11px; color:#819477; }.ui-report-summary button { margin-left:auto; }
.ui-report-source { margin:20px 0; font-size:11px; line-height:1.8; color:#829477; }
section { margin-top:18px; border:1px solid #e0e8d8; border-radius:10px; padding:16px; }h4 { font-size:15px; margin-bottom:10px; }article { display:flex; align-items:center; flex-wrap:wrap; gap:12px; border-top:1px solid #edf1e8; padding:12px 0; font-size:12px; }article > span { flex:1; }article p { width:100%; color:#8d795d; line-height:1.8; }
</style>
