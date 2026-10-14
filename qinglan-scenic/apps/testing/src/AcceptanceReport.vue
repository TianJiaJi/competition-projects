<script setup lang="ts">
import { computed, ref } from 'vue';
import { FileCheck2, Send, Download, AlertCircle, CheckCircle2, Clock3, FileText, ArrowRight } from 'lucide-vue-next';
import TaskTimeline from './TaskTimeline.vue';
import ModalFrame from './ModalFrame.vue';
import { campusProject } from './campus-handoff';
import type { CampusTaskStore } from './task-store';
import { taskSubmissionBlockers } from './task-lifecycle';
const props=defineProps<{store:CampusTaskStore;busy:boolean;running?:boolean}>();
const emit=defineEmits<{generate:[];feedback:[];submit:[];center:[];json:[];html:[];open:[id:string];raw:[id:string]}>();
const report=computed(()=>props.store.acceptance), stale=computed(()=>!!report.value && report.value.revision!==props.store.revision);
const blockers=computed(()=>taskSubmissionBlockers(props.store,props.running));
const allDone=computed(()=>!!report.value && !report.value.untested.length && report.value.sections.every(section=>section.done===section.total));
const confirmOpen=ref(false), confirmed=ref(false);
function openConfirmation(){if(props.busy || blockers.value.length)return;confirmed.value=false;confirmOpen.value=true;}
function submit(){if(!confirmed.value || props.busy || blockers.value.length)return;confirmOpen.value=false;emit('submit');}
</script>
<template>
  <div class="section-intro"><div><span class="eyebrow">ACCEPTANCE / DELIVERY FEEDBACK</span><h1>汇总已有证据，把结论反馈给交付团队。</h1><p>仅汇总已保存的检查和执行记录，未测项与需整改问题不会被隐藏。</p></div><button class="primary" :disabled="busy || !!store.completion" @click="emit('generate')"><FileCheck2 :size="16"/>{{report?'重新汇总验收报告':'汇总验收报告'}}</button></div>
  <div class="acceptance-columns"><div>
    <div v-if="!report" class="panel empty-state"><FileCheck2 :size="43"/><h3>{{store.completion?'当前测试工作区已清空':'等待手动汇总'}}</h3><p v-if="store.completion">已完成任务及验收报告保留在任务中心。<br/>点击对应任务的“查看验收报告”可重新查看，不会恢复工作区测试记录。</p><p v-else>完成各项测试后，点击汇总验收报告。<br/>也可以提前汇总部分记录，清楚查看剩余未测范围。</p><button v-if="store.completion" class="secondary" @click="emit('center')">返回任务中心</button></div>
    <template v-else>
      <div v-if="stale" class="notice" role="status"><AlertCircle :size="16"/>测试记录已更新，请重新汇总后再提交反馈；当前仍为上一份报告快照。</div>
      <section class="panel acceptance-cover"><div class="acceptance-cover-top"><FileCheck2 :size="34"/><div><span class="eyebrow">{{report.id.slice(0,16).toUpperCase()}}</span><h2>智慧校园综合验收报告</h2><p>{{campusProject.brand}} v{{campusProject.version}} · {{new Date(report.at).toLocaleString('zh-CN',{hour12:false})}}</p></div><span class="badge" :class="{issue:report.verdict==='review',good:report.verdict==='passed'}">{{report.verdict==='review'?'存在需整改项':report.verdict==='partial'?'待补测':'本轮已记录检查通过'}}</span></div><div class="acceptance-stat-grid"><article v-for="section in report.sections" :key="section.name"><span>{{section.name}}</span><b>{{section.done}}<em>/ {{section.total}}</em></b><small>{{section.issues?`${section.issues} 项需整改`:section.done<section.total?'有未测范围':'已完成本轮检查'}}</small></article></div><div class="report-source"><CheckCircle2 :size="15"/>UI为人工观察；API、专项与并发测试为本地模型证据，不等同于真实服务性能验收。</div></section>
      <section class="panel acceptance-list"><div class="panel-heading"><h3><AlertCircle :size="17"/>需整改问题</h3><span>{{report.issues.length}} 项</span></div><ul v-if="report.issues.length"><li v-for="issue in report.issues" :key="issue">{{issue}}</li></ul><p v-else>已执行检查中没有记录需整改项，未测范围请查看下方。</p></section>
      <section class="panel acceptance-list"><div class="panel-heading"><h3><Clock3 :size="17"/>未测范围</h3><span>{{report.untested.length}} 项</span></div><ul v-if="report.untested.length"><li v-for="item in report.untested" :key="item">{{item}}</li></ul><p v-else>本轮计划检查项均已执行。</p></section>
      <section class="panel feedback-panel">
        <h3><Send :size="18"/>提交报告与完结任务</h3><p>关联任务：{{store.taskId}} · 接收岗位：{{campusProject.frontend}} / {{campusProject.backend}}</p>
        <template v-if="!store.completion">
          <ul class="submission-checks" aria-label="任务完结条件"><li :class="{ready:allDone}"><component :is="allDone?CheckCircle2:Clock3" :size="15"/>{{allDone?'全部计划测试已完成':'仍有未测范围，需完成UI、API、专项和完整并发测试'}}</li><li :class="{ready:!stale}"><component :is="stale?Clock3:CheckCircle2" :size="15"/>{{stale?'报告不是最新版本，请重新汇总':'报告已包含当前保存的测试记录'}}</li><li :class="{ready:!running}"><component :is="running?Clock3:CheckCircle2" :size="15"/>{{running?'测试正在执行，暂不能完结任务':'当前没有正在运行的测试'}}</li></ul>
          <p v-if="report.issues.length" class="submission-warning">可如实提交这 {{report.issues.length}} 项整改问题并完结本轮测试工作；交付结论仍为“待整改”，不会被改成“验收通过”。</p>
          <div class="toolbar-actions"><button class="primary" :disabled="busy || !!blockers.length" @click="openConfirmation"><Send :size="15"/>提交报告并完结任务</button><button class="secondary" :disabled="busy" @click="emit('json')"><Download :size="14"/>导出验收JSON</button><button class="secondary" :disabled="busy" @click="emit('html')"><FileText :size="14"/>下载验收HTML</button></div>
          <ul v-if="blockers.length" class="submission-blockers" aria-label="待完成事项"><li v-for="reason in blockers" :key="reason">{{reason}}</li></ul>
          <div v-if="!allDone" class="stage-feedback"><p>需要提前同步问题？可提交阶段反馈，但任务仍保留为待补测，不会完结。</p><button class="secondary" :disabled="busy || running || stale || !!report.feedback" @click="emit('feedback')"><Send :size="14"/>{{report.feedback?'反馈已提交':'提交验收反馈'}}</button></div>
        </template>
        <div v-else class="task-completion-receipt"><CheckCircle2 :size="24"/><div><h4>测试任务已完成</h4><p>{{store.completion.verdict==='review'?`报告已归档，${store.completion.issueCount} 项问题待交付团队整改。`:'本轮计划测试与报告提交已完成。'}}</p><small>{{store.completion.id}} · {{new Date(store.completion.at).toLocaleString('zh-CN',{hour12:false})}}</small><small>关联报告 {{store.completion.reportId}} · 记录已锁定为只读</small></div></div>
        <div v-if="store.completion" class="toolbar-actions"><button class="primary" :disabled="busy" @click="emit('center')">返回任务中心<ArrowRight :size="14"/></button><button class="secondary" :disabled="busy" @click="emit('json')"><Download :size="14"/>导出验收JSON</button><button class="secondary" :disabled="busy" @click="emit('html')"><FileText :size="14"/>下载验收HTML</button></div>
        <div v-if="report.feedback" class="feedback-receipt"><CheckCircle2 :size="18"/><div><b>验收反馈已记录 · {{report.feedback.status}}</b><small>{{report.feedback.id}} · {{new Date(report.feedback.at).toLocaleString('zh-CN',{hour12:false})}}</small><p>{{report.verdict==='review'?'问题已关联到本轮交付，等待整改。':report.verdict==='partial'?'未测范围已随报告反馈，等待补测。':'本轮验收材料已归档到交付任务。'}}</p></div></div>
        <p class="submission-source">提交与归档均为本工作台本地记录，不代表远程交付团队已实际接收；测试任务完结与项目验收结论分别保留。</p>
      </section>
    </template>
    <section class="panel archived-reports"><div class="panel-heading"><h3>本轮原始执行报告</h3><span>{{store.reports.length+(store.uiReports?.length || 0)}} 份</span></div><article v-for="item in store.uiReports || []" :key="item.id"><span class="badge">UI测试</span><div><b>{{item.id.slice(0,11).toUpperCase()}}</b><small>{{new Date(item.at).toLocaleString('zh-CN',{hour12:false})}} · {{item.passed}} 通过 / {{item.issues}} 需整改</small></div><button class="text-button" :disabled="busy" @click="emit('open',item.id)">查看UI报告</button><button class="text-button" :disabled="busy" @click="emit('raw',item.id)">导出UI原始JSON</button></article><article v-for="item in store.reports" :key="item.id"><span class="badge">{{item.kind==='suite'?'API验证':item.kind==='load'?'并发测试':'专项验证'}}</span><div><b>{{item.id.slice(0,8).toUpperCase()}}</b><small>{{new Date(item.startedAt).toLocaleString('zh-CN',{hour12:false})}} · {{item.status==='completed'?'本次执行结束':'阶段记录'}}</small></div><button class="text-button" :disabled="busy" @click="emit('open',item.id)">查看报告</button><button class="text-button" :disabled="busy" @click="emit('raw',item.id)">导出原始JSON</button></article><p v-if="!store.reports.length && !store.uiReports?.length">尚未执行测试，暂无原始报告。</p></section>
  </div><TaskTimeline :entries="store.timeline"/></div>
  <ModalFrame v-if="confirmOpen && report" title="提交报告并完结任务" @close="confirmOpen=false"><div class="environment-body submit-confirmation"><span class="badge">{{store.taskId}}</span><h3>确认结束本轮测试工作？</h3><p>将提交当前报告及问题清单，生成本地归档回执，并将本轮任务标记为“已完成”。随后自动清空测试工作区并返回任务中心，任务及报告保留为只读归档，可随时查看与导出。</p><p v-if="report.issues.length" class="submission-warning">本报告含 {{report.issues.length}} 项整改问题。任务完结后交付结论仍为“待整改”，不表示项目验收通过。</p><p v-else>报告结论：本轮已记录检查通过。API、专项及并发测试证据来自本地模型，不等同于真实服务性能验收。</p><label class="submission-acknowledgement"><input v-model="confirmed" type="checkbox"/>我已核对测试范围与问题清单，确认提交本轮测试结论</label><ul v-if="blockers.length" class="submission-blockers"><li v-for="reason in blockers" :key="reason">{{reason}}</li></ul></div><div class="dialog-footer"><button class="secondary" @click="confirmOpen=false">继续检查</button><button class="primary" :disabled="!confirmed || busy || !!blockers.length" @click="submit">确认提交并完结</button></div></ModalFrame>
</template>
<style scoped>
.submission-checks { display:grid; gap:10px; margin:0 0 18px; padding:0; list-style:none; font-size:12px; color:#a18854; }
.submission-checks li { display:flex; align-items:center; gap:7px; line-height:1.7; }
.submission-checks .ready { color:#5f8353; }
.submission-warning { color:#a37b37 !important; font-size:12px; line-height:1.8; }
.submission-blockers { margin:14px 0 0; padding-left:18px; color:#9a8760; font-size:11px; line-height:1.9; }
.stage-feedback { margin-top:20px; border-top:1px solid var(--line); padding-top:14px; }
.stage-feedback p { margin:0 0 12px; }
.submission-source { margin:18px 0 0 !important; font-size:10px !important; }
.task-completion-receipt { display:flex; align-items:flex-start; gap:12px; background:#f1f7eb; padding:18px; border:1px solid #dce8d3; border-radius:10px; margin-bottom:18px; color:#4f7e4c; }
.task-completion-receipt h4 { font-size:17px; margin:0 0 10px; }
.task-completion-receipt p { margin:0 0 10px; }
.task-completion-receipt small { display:block; overflow-wrap:anywhere; font:10px/1.9 var(--mono); color:#829776; }
.submit-confirmation h3 { font-size:19px; margin:16px 0; }
.submission-acknowledgement { display:flex; align-items:flex-start; gap:9px; font-size:12px; line-height:1.9; color:#3d6243; padding:14px; background:#f3f7ed; border-radius:8px; }
.submission-acknowledgement input { margin-top:5px; accent-color:#25634f; flex-shrink:0; }
</style>
