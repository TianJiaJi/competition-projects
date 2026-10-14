<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ShieldCheck, Sparkles, UserRound, Square, PencilLine, Play, FileText, LoaderCircle, CheckCircle2, ArrowRight } from 'lucide-vue-next';
import SpecialWorkspace from './SpecialWorkspace.vue';
import { assignments } from './campus-handoff';
import { specialTemplates } from './special-plan';
import type { CampusTaskStore, SpecialNote, CheckResult } from './task-store';
import type { ScenarioId, ScenarioRuns } from './special-engine';
const props=defineProps<{store:CampusTaskStore;runs:ScenarioRuns;busy:boolean;busyId:ScenarioId|null;running:boolean;batch:boolean;activeId:ScenarioId}>();
const emit=defineEmits<{generate:[];run:[];advance:[id:ScenarioId,step:number];reset:[id:ScenarioId,parameter?:string];report:[];cancel:[];select:[id:ScenarioId];note:[id:ScenarioId,value:SpecialNote];manual:[id:ScenarioId,result:CheckResult]}>();
const selected=ref<ScenarioId>(props.activeId),executionPanel=ref<HTMLElement|null>(null);
watch(()=>props.batch,async active=>{if(active){await nextTick();executionPanel.value?.scrollIntoView({block:'start',behavior:'instant'});}});
const assignment=computed(()=>assignments.find(item=>item.id===selected.value)!);
const completed=computed(()=>assignments.filter(item=>props.runs[item.id].step===3).length);
const allDone=computed(()=>completed.value===assignments.length);
const manualPending=computed(()=>assignments.filter(item=>props.store.specialNotes[item.id]?.checkpoint && props.store.specialNotes[item.id]?.result==='pending').length);
const batchProgress=computed(()=>Math.round(assignments.reduce((sum,item)=>{
  const run=props.runs[item.id];
  const fraction=run.step===1 && run.requests.length?run.requests.filter(request=>!['queued','processing'].includes(request.status)).length/run.requests.length:0;
  return sum+run.step+fraction;
},0)/(assignments.length*3)*100));
const activeIndex=computed(()=>assignments.findIndex(item=>item.id===props.activeId));
const activeRun=computed(()=>props.runs[props.activeId]);
const note=ref(''),checkpoint=ref('');
function syncDraft(){note.value=props.store.specialNotes[selected.value]?.note || '';checkpoint.value=props.store.specialNotes[selected.value]?.checkpoint || '';}
watch(()=>props.activeId,id=>{selected.value=id;});
watch(selected,id=>{syncDraft();emit('select',id);});syncDraft();
</script>
<template>
  <div class="section-intro"><div><span class="eyebrow">BACKEND ASSIGNMENT / BUSINESS GUARDS</span><h1>从工程师指派，到有据可查的专项验证。</h1><p>先理解要求并生成用例，再一键按序执行；也可逐项准备、触发与核验。</p></div><button v-if="running && !batch" class="secondary" @click="emit('cancel')"><Square :size="14"/>取消当前专项操作</button></div>
  <section class="panel engineer-assignment">
    <div class="panel-heading"><div><h2><UserRound :size="18"/>后端工程师专项指派</h2><p class="assignment-heading-note">上游需求与验收标准 · {{assignments.length}} 项固定任务</p></div><button class="primary" :disabled="busy || !!store.specialGeneratedAt" @click="emit('generate')"><Sparkles :size="15"/>{{store.specialGeneratedAt?'专项用例已生成':'生成专项用例'}}</button></div>
    <details class="assignment-requirements" :open="!store.specialGeneratedAt"><summary>查看后端要求与执行方式<span>{{store.specialGeneratedAt?'已关联下方测试案例':'先确认任务，再生成测试用例'}}</span></summary><div class="engineer-message"><span class="avatar">后</span><div><b>后端工程师</b><p>请重点验证预约写入、同一时段资源与班级权限。以下为本轮验收要求，请保留过程与断言证据。</p><small>关联交付 {{store.handoffId}} · 指派 4 项</small></div></div><div class="assignment-grid"><article v-for="item in assignments" :key="item.id"><span class="eyebrow">{{item.endpointId}}</span><h3><ShieldCheck :size="16"/>{{item.title}}</h3><p>{{item.risk}}</p><div><b>怎么测试</b>{{specialTemplates.find(template=>template.scenarioId===item.id)?.strategy}}</div><div><b>验收标准</b>{{item.standard}}</div></article></div></details>
  </section>
  <template v-if="store.specialGeneratedAt">
    <section ref="executionPanel" class="panel special-run-panel" aria-label="专项一键测试">
      <div class="special-run-heading"><div><h2><ShieldCheck :size="18"/>专项测试案例</h2><p>本地模板已拼装 · {{assignments.length}} 项场景 / 12 个模型断言 · {{batch?'按指派顺序自动执行':'支持一键测试或单步核验'}}</p></div><div class="toolbar-actions"><span v-if="allDone && !batch" class="badge good"><CheckCircle2 :size="14"/>已完成</span><button v-if="batch" class="secondary" @click="emit('cancel')"><Square :size="14"/>停止一键测试</button><button v-if="!allDone || batch" class="primary" :disabled="busy" @click="emit('run')"><LoaderCircle v-if="batch" :size="15" class="spinning"/><Play v-else :size="15"/>{{batch?'测试中…':'一键测试'}}</button><button v-if="allDone && !batch" class="primary" :disabled="busy" @click="emit('report')"><FileText :size="15"/>查看报告</button><button v-else-if="completed>0 && !running" class="secondary" :disabled="busy" @click="emit('report')">查看阶段报告</button></div></div>
      <div v-if="batch" class="special-batch-progress" role="progressbar" aria-label="专项自动测试进度" :aria-valuenow="batchProgress" aria-valuemin="0" aria-valuemax="100"><div><span><LoaderCircle :size="15" class="spinning"/>{{activeIndex+1}} / {{assignments.length}} · {{assignments[activeIndex]?.title}}<small>{{activeRun.step===3?(activeIndex===assignments.length-1?'全部场景核验完成，正在整理报告':'本场核验完成，准备切换下一项'):['准备条件','触发请求','核验结果'][activeRun.step]}}</small></span><b>{{batchProgress}}%</b></div><div class="special-progress-track"><i :style="{width:`${batchProgress}%`}"/></div><ol><li v-for="item in assignments" :key="item.id" :class="{done:runs[item.id].step===3,active:activeId===item.id}"><CheckCircle2 v-if="runs[item.id].step===3" :size="13"/><LoaderCircle v-else-if="activeId===item.id" :size="13" class="spinning"/><i v-else/>{{item.title}}</li></ol></div>
      <div v-else-if="allDone" class="special-completion"><CheckCircle2 :size="17"/><p>4 项场景已全部核验，专项报告已保存。<span v-if="manualPending">另有 {{manualPending}} 项补充检查待人工确认，不会自动标记通过。</span><span v-else>可查看报告与完整过程证据。</span></p><ArrowRight :size="15"/></div>
      <p class="special-model-note">自动执行基于本地场景模型，不向校园业务服务发送测试请求，也不等同于真实服务验收。</p>
    </section>
    <SpecialWorkspace class="campus-special-workspace" campus hide-report :runs="runs" :busy="busy" :busy-id="busyId" :active-id="selected" @advance="(id,step)=>emit('advance',id,step)" @reset="(id,parameter)=>emit('reset',id,parameter)" @report="emit('report')" @select="id=>selected=id"/>
    <section class="panel special-case-notes"><div class="panel-heading"><h3><PencilLine :size="17"/>{{assignment.title}} · 用例补充</h3><span>原始指派标准不可修改</span></div><div class="special-note-form"><label>执行备注<textarea v-model="note" aria-label="专项执行备注" rows="2" maxlength="1000" :disabled="busy"/></label><label>补充人工检查点<textarea v-model="checkpoint" aria-label="专项补充检查点" rows="2" maxlength="1000" :disabled="busy"/></label><div><button class="secondary" :disabled="busy" @click="emit('note',selected,{note,checkpoint,result:'pending'})">保存专项用例补充</button><template v-if="store.specialNotes[selected]?.checkpoint"><button class="secondary" :disabled="busy || runs[selected].step!==3" @click="emit('manual',selected,'passed')">确认专项补充检查通过</button><button class="secondary" :disabled="busy || runs[selected].step!==3" @click="emit('manual',selected,'issue')">专项补充检查需整改</button><span class="badge">{{store.specialNotes[selected]?.result==='passed'?'通过':store.specialNotes[selected]?.result==='issue'?'需整改':'待人工确认'}}</span></template></div></div></section>
  </template>
</template>
<style scoped>
.assignment-heading-note { font-size:11px; color:#94a187; margin-top:8px; }
.assignment-requirements summary { padding:0 24px 19px; cursor:pointer; color:#749264; font-size:11px; }
.assignment-requirements summary span { float:right; font-size:10px; color:#a2ae96; }
.assignment-grid article > div + div { margin-top:12px; }
.engineer-message { padding-top:4px; }
.special-run-panel { margin-bottom:18px; overflow:hidden; }
.special-run-heading { display:flex; align-items:center; justify-content:space-between; gap:15px; padding:19px 22px; flex-wrap:wrap; }
.special-run-heading h2 { display:flex; align-items:center; gap:8px; font-size:15px; font-weight:500; color:#355b40; }
.special-run-heading p { font-size:11px; line-height:1.8; color:#90a080; margin-top:7px; }
.special-run-heading button { font-size:12px; }
.special-batch-progress { padding:16px 22px 13px; background:#f1f7eb; border-top:1px solid #e3ebdc; }
.special-batch-progress > div:first-child { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:12px; color:#4b7549; }
.special-batch-progress > div:first-child > span { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
.special-batch-progress small { font-size:10px; color:#91a17f; }
.special-batch-progress b { font:12px var(--mono); }
.special-progress-track { height:5px; border-radius:5px; overflow:hidden; background:#dfe9d5; margin-top:13px; }
.special-progress-track > i { display:block; height:100%; background:#4e8254; position:relative; transition:width .15s; }
.special-progress-track > i::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent,#ffffff77,transparent); animation:special-flow 1.3s linear infinite; }
.special-batch-progress ol { display:flex; flex-wrap:wrap; list-style:none; gap:12px 23px; padding:0; margin:12px 0 0; }
.special-batch-progress li { display:flex; align-items:center; gap:6px; font-size:10px; color:#a0ac96; }.special-batch-progress li > i { width:6px; height:6px; border-radius:50%; background:#d2ddc7; }.special-batch-progress li.done { color:#608650; }.special-batch-progress li.active { color:#25634f; }
.special-completion { display:flex; gap:10px; align-items:center; padding:14px 22px; border-top:1px solid #e4ecd9; background:#f2f7ec; color:#63844e; font-size:11px; line-height:1.9; }.special-completion p { flex:1; }.special-completion p span { display:block; color:#96a584; font-size:10px; }
.special-model-note { padding:11px 22px; font-size:10px; line-height:1.8; color:#9baa90; border-top:1px solid #edf1e8; }
@keyframes special-flow { from { transform:translateX(-100%); } to { transform:translateX(100%); } }
@media(max-width:700px) { .assignment-requirements summary { padding-inline:16px; }.assignment-requirements summary span { display:block; float:none; margin-top:8px; }.special-run-heading,.special-batch-progress,.special-completion { padding-inline:16px; }.special-run-heading .toolbar-actions { width:100%; }.special-batch-progress ol { gap:10px; }.special-batch-progress li { font-size:9px; }.special-run-heading p { font-size:10px; } }
</style>
