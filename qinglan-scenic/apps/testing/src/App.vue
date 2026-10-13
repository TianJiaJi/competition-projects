<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { LayoutDashboard, PackageOpen, Monitor, Code2, ShieldCheck, Gauge, FileCheck2, ChevronRight, LoaderCircle, RotateCcw, Send, CheckCircle2 } from 'lucide-vue-next';
import TaskCenter from './TaskCenter.vue';
import ProjectOverview from './ProjectOverview.vue';
import UiTestWorkspace from './UiTestWorkspace.vue';
import UiReportView from './UiReport.vue';
import { completeUiReport, uiReportDocument } from './ui-report';
import ApiTestWorkspace from './ApiTestWorkspace.vue';
import PressureWorkspace from './PressureWorkspace.vue';
import SpecialTaskWorkspace from './SpecialTaskWorkspace.vue';
import AcceptanceReport from './AcceptanceReport.vue';
import { buildAcceptance, feedbackAcceptance, acceptanceDocument, acceptanceHtml } from './acceptance';
import SpecialReportView from './SpecialReport.vue';
import { SpecialSession, createRuns, createSpecialReport, type ScenarioId, type ScenarioRuns, type SpecialReport } from './special-engine';
import { specialReportHtml } from './special-report';
import LoadReport from './LoadReport.vue';
import { loadReportHtml } from './report-export';
import EnvironmentStatus from './EnvironmentStatus.vue';
import ModalFrame from './ModalFrame.vue';
import { campusProject, deliverySystem, apiMaterials, assignments } from './campus-handoff';
import { receiveDelivery, newTaskStore, appendEvent, touchTask, uiCheckKey, parseMaterials, generateApiCases, copy, type SpecialNote, type CheckResult, type CaseNote, type UiCheck, type CampusTaskStore } from './task-store';
import { delay, modelSample, startLoadSession, normalizeConfig, retainReports, reportDocument, type EndpointConfig, type Sample, type MeasurementReport, type LoadResult, type LoadSession, type LoadConfig, type Report } from './engine';
import { resolveEndpoints } from './systems';
import { apiDisplayTiming } from './api-display-timing';
import { restoreRuntimeTask, saveRuntimeTask } from './runtime-task';
const store = ref<CampusTaskStore>(restoreRuntimeTask());
watch(store,value=>{const saved=saveRuntimeTask(value);if(!saved.saved)notice.value='浏览器无法保存进度，请先导出报告，避免刷新丢失。';},{deep:true,flush:'post'});
const tabs = [ { id: 'center', label: '任务中心', icon: LayoutDashboard }, { id: 'overview', label: '交付概览', icon: PackageOpen }, { id: 'ui', label: 'UI测试', icon: Monitor }, { id: 'api', label: 'API测试', icon: Code2 }, { id: 'special', label: '专项测试', icon: ShieldCheck }, { id: 'load', label: '压力测试', icon: Gauge }, { id: 'reports', label: '验收报告', icon: FileCheck2 } ] as const;
type Tab = typeof tabs[number]['id'];
const tab = ref<Tab>('center'), busy = ref<string | null>(null), notice = ref(''), resetOpen = ref(false);
let controller: AbortController | undefined;
let apiController:AbortController|undefined,loadController:AbortController|undefined;
const apiWaiting=ref(false);
const apiRunning=ref(false),loadRunning=ref(false),specialRunning=ref(false);
const anyRunning=computed(()=>!!busy.value || apiRunning.value || loadRunning.value || specialRunning.value);
const specialRuns = shallowRef<ScenarioRuns>(store.value.specialRuns || createRuns('campus')), specialBusyId=ref<ScenarioId|null>(null), specialReportId=ref<string|null>(null);
let specialSession:SpecialSession;
function initSpecial(initial?:ScenarioRuns) { specialSession?.dispose();specialSession=new SpecialSession((runs,id)=>{specialRuns.value=runs;specialBusyId.value=id;store.value.specialRuns=copy(runs);},100,initial,'campus');specialRuns.value=specialSession.snapshot(); }
initSpecial(store.value.specialRuns || undefined);
const selectedSpecialReport=computed(()=>store.value.reports.find(r=>r.id===specialReportId.value && r.kind==='special') as SpecialReport | undefined);
const runningId = ref<string|null>(null), apiProgress = ref(0), processingSteps = ref<string[]>([]), processingDone = ref(0);
const system = computed(() => ({...deliverySystem(), endpoints: store.value.apiCases.length ? copy(store.value.apiCases) : deliverySystem().endpoints}));
const loadResult = shallowRef<LoadResult|null>(null), loadReportId = ref<string|null>(null);
const loadConfig = ref<LoadConfig>();
let loadSession: LoadSession | undefined;
const selectedLoadReport = computed(() => store.value.reports.find(r=>r.id===loadReportId.value && r.kind==='load') as MeasurementReport | undefined);
const latestLoadReport = computed(() => store.value.reports.find(r=>r.id===store.value.latestLoadId && r.kind==='load') as MeasurementReport | undefined);
function restoreLoad() { const r=latestLoadReport.value; loadConfig.value=r?.config ? copy(r.config) : undefined; loadResult.value=r ? {samples:r.samples,observations:r.observations,frames:r.frames,events:r.events,elapsedMs:r.elapsedMs,level:r.frames.at(-1)?.level || 0,phase:r.status,status:r.status} : null; }
restoreLoad();
function download(name:string, value:string, type:string) { const url=URL.createObjectURL(new Blob([value],{type})); const a=document.createElement('a'); a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000); }
function exportReport(report: Report, kind:'json'|'html') { download(`service-test-${report.kind}-${report.id}.${kind}`,kind==='json' ? JSON.stringify(reportDocument(report),null,2) : report.kind==='load' ? loadReportHtml(report) : report.kind==='special' ? specialReportHtml(report) : '',kind==='json'?'application/json':'text/html'); }
function archive(report: Report) { store.value.reports=retainReports(store.value.reports, report); touchTask(store.value); }
function stop() { controller?.abort(); }
function stopApi(){apiController?.abort();}
function stopLoad(){loadController?.abort();}
function stopSpecial(){specialSession.cancel();}
async function generateSpecial() {
  if(busy.value || !store.value.receivedAt || store.value.specialGeneratedAt)return;busy.value='生成专项测试用例';processingSteps.value=['读取后端工程师4项指派','关联风险、固定标准与场景参数','专项用例已就绪，等待手动执行'];processingDone.value=0;const current=new AbortController();controller=current;
  try{for(let i=0;i<3;i++){await delay(400,current.signal);processingDone.value=i+1;}initSpecial();store.value.specialGeneratedAt=new Date().toISOString();store.value.specialRuns=copy(specialRuns.value);touchTask(store.value);appendEvent(store.value,'生成专项测试用例','4项后端指派已映射，尚未执行场景');notice.value='专项用例已生成，请逐步准备、触发与核验。';}catch{notice.value='专项生成已取消。';}finally{busy.value=null;}
}
async function advanceSpecial(id:ScenarioId,step:number) {
  if(busy.value || specialRunning.value || !store.value.specialGeneratedAt || !assignments.some(a=>a.id===id))return;specialRunning.value=true;touchTask(store.value);const title=assignments.find(a=>a.id===id)!.title;
  try{const completed=await specialSession.advance(id,step);touchTask(store.value);appendEvent(store.value,completed?`${title} · ${['准备条件','触发请求','核验结果'][step]}`:'专项操作已取消',completed?`${specialRuns.value[id].events.length} 条过程记录 · 当前进度 ${specialRuns.value[id].step}/3`:'当前场景已重置，其他场景保留');}catch(error){notice.value=`专项操作暂停：${String(error)}`;}finally{specialRunning.value=false;}
}
function resetSpecial(id:ScenarioId,parameter?:string) {if(busy.value || specialRunning.value)return;specialSession.reset(id,parameter);const old=store.value.specialNotes[id];if(old)old.result='pending';touchTask(store.value);appendEvent(store.value,'重置专项场景',`${assignments.find(a=>a.id===id)?.title} · 参数 ${specialRuns.value[id].parameter}，等待重测`);}
function saveSpecialNote(id:ScenarioId,value:SpecialNote) {if(busy.value || specialRunning.value)return;store.value.specialNotes[id]={...copy(value),result:'pending'};touchTask(store.value);appendEvent(store.value,'调整专项用例补充',`${assignments.find(a=>a.id===id)?.title} · 补充检查等待人工确认`);}
function confirmSpecial(id:ScenarioId,result:CheckResult) {if(busy.value || specialRunning.value || specialRuns.value[id].step!==3 || !store.value.specialNotes[id]?.checkpoint)return;store.value.specialNotes[id]!.result=result;touchTask(store.value);appendEvent(store.value,'确认专项人工检查',`${assignments.find(a=>a.id===id)?.title} · ${result==='passed'?'通过':'需整改'}`);}
function saveSpecialReport() {if(busy.value || specialRunning.value)return;const report=createSpecialReport(system.value,specialRuns.value,assignments.map(a=>a.id));report.taskId=store.value.taskId;report.handoffId=store.value.handoffId;report.caseNotes=copy(store.value.specialNotes);archive(report);specialReportId.value=report.id;appendEvent(store.value,'生成专项验收报告',`${report.scenarios.filter(r=>r.step===3).length}/4 场景已核验`);}
async function materialAction(action:'parse'|'generate') {
  if (busy.value || !store.value.receivedAt || action==='parse' && store.value.apiParsedAt || action==='generate' && (!store.value.apiParsedAt || store.value.apiGeneratedAt)) return;
  busy.value=action==='parse'?'解析交付API材料':'生成API测试用例'; processingSteps.value=action==='parse' ? ['读取项目API交付清单','识别方法、岗位和请求参数','关联响应示例与验收标准'] : ['按接口用途建立测试项','映射响应契约和耗时预算','用例已就绪，等待手动运行']; processingDone.value=0;
  const current=new AbortController();controller=current;
  try { for (let i=0;i<processingSteps.value.length;i++) { await delay(400,current.signal); processingDone.value=i+1; } if (action==='parse') parseMaterials(store.value); else generateApiCases(store.value); notice.value=action==='parse'?'API材料已解析，请手动生成测试用例。':'API用例已生成，尚未执行测试。'; }
  catch {notice.value='操作已取消，未提交本轮材料处理结果。';} finally {busy.value=null;}
}
function editApi(config: EndpointConfig, note: CaseNote) { if(busy.value || apiRunning.value)return; const index=store.value.apiCases.findIndex(c=>c.id===config.id);if(index<0)return;store.value.apiCases[index]=copy(config);store.value.apiNotes[config.id]={...copy(note),result:'pending'};delete store.value.apiResults[config.id];touchTask(store.value);appendEvent(store.value,'调整API用例',`${config.name} · 旧结果已清除，等待重测`);notice.value='用例已更新，需重新执行；人工补充检查不会自动通过。'; }
function confirmApi(id:string,result:CheckResult) { if(busy.value || apiRunning.value || !store.value.apiNotes[id]?.checkpoint || !store.value.apiResults[id] || store.value.apiResults[id].outcome==='cancelled')return;store.value.apiNotes[id].result=result;touchTask(store.value);appendEvent(store.value,'人工补充API检查',`${store.value.apiCases.find(c=>c.id===id)?.name} · ${result==='passed'?'通过':'需整改'}`); }
async function runApi(ids:string[]) {
  if(busy.value || apiRunning.value || !store.value.apiGeneratedAt)return;const snapshot=copy(system.value);const targets=resolveEndpoints(snapshot).filter(e=>ids.includes(e.id));if(!targets.length)return;
  apiRunning.value=true;apiProgress.value=0;const current=new AbortController();apiController=current;
  for(const target of targets)delete store.value.apiResults[target.id];touchTask(store.value);const start=performance.now(),startedAt=new Date().toISOString(),samples:Sample[]=[];
  const timing=apiDisplayTiming(targets.length);
  appendEvent(store.value,'开始API验证',`手动运行 ${targets.length} 项用例`);
  try {for(const [index,endpoint] of targets.entries()) { if(current.signal.aborted)break;runningId.value=endpoint.id; if(store.value.apiNotes[endpoint.id]?.checkpoint)store.value.apiNotes[endpoint.id].result='pending'; let sample:Sample;
    try {apiWaiting.value=timing[index].stalled;await delay(timing[index].delayMs,current.signal);apiWaiting.value=false;sample=modelSample(endpoint,index,0,0,20,'model');}catch{sample={endpointId:endpoint.id,source:'model',at:new Date().toISOString(),elapsedMs:0,status:null,outcome:'cancelled',checks:[],requestId:`cancelled-${endpoint.id}`,bytes:0,preview:'',error:'本轮已取消'};}
    if(sample.outcome==='cancelled')sample={...sample,status:null,preview:'',checks:[],bytes:0};store.value.apiResults[endpoint.id]=sample;touchTask(store.value);samples.push(sample);apiProgress.value=samples.filter(s=>s.outcome!=='cancelled').length/targets.length*100;
  }} finally { const stopped=current.signal.aborted;archive({id:crypto.randomUUID(),kind:'suite',system:snapshot,taskId:store.value.taskId,handoffId:store.value.handoffId,caseNotes:copy(store.value.apiNotes),startedAt,elapsedMs:performance.now()-start,status:stopped?'stopped':'completed',samples,observations:[],frames:[],events:[]});appendEvent(store.value,stopped?'API测试已停止':'API验证完成',`${samples.filter(s=>s.outcome==='passed').length} 项通过 / ${samples.filter(s=>s.outcome==='failed').length} 项未通过 · 下一项测试等待手动发起`);notice.value=stopped?'API测试已停止，已完成记录保留。':'本轮API验证已完成，可查看每项响应与断言。';runningId.value=null;apiWaiting.value=false;apiRunning.value=false;apiController=undefined; }
}
async function runLoad(input:LoadConfig) { if(busy.value || loadRunning.value || !store.value.apiGeneratedAt)return;const snapshot=copy(system.value), config=normalizeConfig(input,resolveEndpoints(snapshot)), startedAt=new Date().toISOString();loadConfig.value=copy(config);loadRunning.value=true;store.value.latestLoadId=null;touchTask(store.value);const current=new AbortController();loadController=current;appendEvent(store.value,'开始压力测试',`${config.concurrency} 并发 / ${config.duration} 秒 · 手动启动`);loadSession=startLoadSession(snapshot,config,current.signal,value=>{loadResult.value=value;});try{const result=await loadSession.completion;const report:MeasurementReport={id:crypto.randomUUID(),kind:'load',system:snapshot,taskId:store.value.taskId,handoffId:store.value.handoffId,startedAt,elapsedMs:result.elapsedMs,status:result.status==='completed'?'completed':'stopped',samples:result.samples,observations:result.observations,frames:result.frames,events:result.events,config};archive(report);store.value.latestLoadId=report.id;appendEvent(store.value,result.status==='completed'?'压力测试完成':'压力测试已停止',`已记录 ${result.events.length} 个加压节点；可手动查看报告`);notice.value='本轮压力记录已保存，下一项操作仍需手动触发。';}catch(error){notice.value=`压力测试暂停：${String(error)}`;}finally{loadRunning.value=false;loadController=undefined;loadSession=undefined;} }
function increaseLoad() { if(loadRunning.value && loadSession?.increase())appendEvent(store.value,'手动加压一级',`当前第 ${loadResult.value?.level} 级`); }
function navigate(value: Tab) { if (busy.value || value !== 'center' && !store.value.receivedAt) return; tab.value = value; }
async function receive() {
  if (busy.value) return;
  if (store.value.receivedAt) { tab.value = 'overview'; notice.value = '本版本已接收，已打开原测试任务。'; return; }
  busy.value = '正在接收项目交付'; const current = new AbortController(); controller = current;
  try { await delay(650, current.signal); receiveDelivery(store.value); notice.value = '收到新交付消息 · 新增 1 项智慧校园测试任务'; }
  catch { notice.value = '接收已取消，未创建任务。'; } finally { busy.value = null; }
}
const uiReportId=ref<string|null>(null);
const selectedUiReport=computed(()=>store.value.uiReports?.find(r=>r.id===uiReportId.value));
function exportUiReport(id:string){const report=store.value.uiReports?.find(r=>r.id===id);if(report)download(`${report.id}.json`,JSON.stringify(uiReportDocument(report),null,2),'application/json');}
const uiDone = computed(() => Object.values(store.value.uiChecks).filter(check => check.result !== 'pending').length);
const apiDone = computed(() => Object.values(store.value.apiResults).filter(result => result.outcome !== 'cancelled').length);
function status(id: Tab) { if(id==='api' && apiRunning.value)return `运行中 ${Math.round(apiProgress.value)}%`;if(id==='load' && loadRunning.value)return '压测中';if(id==='special' && specialRunning.value)return '执行中'; if (!store.value.receivedAt) return '待接收'; if (id === 'ui') return uiDone.value ? `${uiDone.value} 项已检查` : '待检查'; if (id === 'api') return apiDone.value ? `${apiDone.value} 项已执行` : store.value.apiGeneratedAt ? '待执行' : '待生成'; if (id === 'special') {const done=assignments.filter(a=>store.value.specialRuns?.[a.id].step===3).length;return done?`${done}/4 已核验`:store.value.specialGeneratedAt?'待执行':'待生成';} if (id === 'load') return latestLoadReport.value?.status==='completed'?'已完成':store.value.latestLoadId?'阶段记录':'待执行'; if (id === 'reports') return store.value.acceptance && store.value.acceptance.revision!==store.value.revision ? '需重新汇总' : store.value.acceptance?.feedback ? '已反馈' : store.value.acceptance ? '待反馈' : '待汇总'; return '已接收'; }
function saveUi(checks: UiCheck[]) {
  if (busy.value || !store.value.receivedAt) return;
  for (const check of checks) store.value.uiChecks[uiCheckKey(check.pageId, check.index)] = check;
  touchTask(store.value); appendEvent(store.value, '保存UI检查', `${campusProject.pages.find(p=>p.id===checks[0]?.pageId)?.name} · ${checks.filter(c=>c.result==='passed').length} 项通过 / ${checks.filter(c=>c.result==='issue').length} 项需整改`);
  notice.value = '页面检查已保存，需整改项将汇入验收报告。';
  const report=completeUiReport(store.value);
  if(report){
    store.value.uiReports=[report,...(store.value.uiReports || [])].slice(0,8);
    appendEvent(store.value,'UI测试完成',`${report.total} 项检查 · ${report.passed} 通过 / ${report.issues} 需整改 · 报告已归档`);
    uiReportId.value=report.id;
  }
}
function openedUi(name: string) { appendEvent(store.value, '打开项目UI', `${name} · 内嵌预览，等待人工检查`); }
function generateAcceptance() {if(busy.value || !store.value.receivedAt)return;store.value.acceptance=buildAcceptance(store.value);appendEvent(store.value,'汇总验收报告',`${store.value.acceptance.issues.length} 项需整改 / ${store.value.acceptance.untested.length} 项未测，已生成独立快照`);notice.value='综合报告已汇总，确认后可手动提交反馈。';}
async function feedback() {if(busy.value || !store.value.acceptance || store.value.acceptance.revision!==store.value.revision || store.value.acceptance.feedback)return;busy.value='提交验收反馈';processingSteps.value=['整理本轮检查与问题清单','关联项目版本与接收岗位','记录验收反馈回执'];processingDone.value=0;const current=new AbortController();controller=current;try{for(let i=0;i<3;i++){await delay(400,current.signal);processingDone.value=i+1;}if(feedbackAcceptance(store.value)){appendEvent(store.value,'验收反馈已记录',`${store.value.acceptance!.feedback!.id} · ${store.value.acceptance!.feedback!.status}`);notice.value='验收反馈已记录，本轮材料与回执已关联。';}}catch{notice.value='反馈已取消，报告仍保留，未生成回执。';}finally{busy.value=null;}}
function exportAcceptance(kind:'json'|'html') {const report=store.value.acceptance;if(!report)return;download(`campus-acceptance-${report.id}.${kind}`,kind==='json'?JSON.stringify(acceptanceDocument(report),null,2):acceptanceHtml(report),kind==='json'?'application/json':'text/html');}
function openReport(id:string) {if(store.value.uiReports?.some(r=>r.id===id)){uiReportId.value=id;return;}const r=store.value.reports.find(r=>r.id===id);if(r?.kind==='load')loadReportId.value=id;else if(r?.kind==='special')specialReportId.value=id;}
function rawReport(id:string) {if(store.value.uiReports?.some(r=>r.id===id)){exportUiReport(id);return;}const r=store.value.reports.find(r=>r.id===id);if(r)exportReport(r,'json');}
function reset() { if (anyRunning.value) return; store.value = newTaskStore(); uiReportId.value=null; initSpecial(); specialReportId.value=null; loadResult.value=null; loadConfig.value=undefined; loadReportId.value=null; resetOpen.value = false; tab.value = 'center'; notice.value = '讲解流程已重置，校园项目业务数据未改动。'; }
onBeforeUnmount(() => { controller?.abort();apiController?.abort();loadController?.abort();specialSession.dispose(); });
</script>
<template>
  <div class="workbench-shell"><aside class="workbench-sidebar"><a class="brand" href="#" @click.prevent="navigate('center')"><span class="brand-icon"><ShieldCheck :size="27"/></span><div><b>质量测试工作台</b><small>QUALITY WORKBENCH</small></div></a><div class="sidebar-project"><span class="eyebrow">当前测试项目</span><template v-if="store.receivedAt"><b>{{ campusProject.name }} <span>v{{ campusProject.version }}</span></b><p>{{ campusProject.brand }} · 五端项目</p></template><template v-else><b>等待接收项目</b><p>接收交付后显示项目信息</p></template></div><nav aria-label="测试工作台导航"><button v-for="item in tabs" :key="item.id" :disabled="!!busy || item.id !== 'center' && !store.receivedAt" :class="{active:tab===item.id}" :aria-current="tab===item.id ? 'page' : undefined" @click="navigate(item.id)"><component :is="item.icon" :size="18"/><span>{{ item.label }}</span><i v-if="item.id==='center' && store.receivedAt">1</i><small v-else-if="item.id!=='center'">{{ status(item.id) }}</small></button></nav><div class="sidebar-footer"><button class="avatar" aria-label="立即重置工作台" :disabled="anyRunning" @click="reset">测</button><div><b>测试工程师</b><small>进度自动保存 · 刷新不清空</small></div></div></aside>
    <div class="workbench-main"><header class="workbench-header"><div class="breadcrumb">工作台<ChevronRight :size="14"/><b>{{ tabs.find(item=>item.id===tab)?.label }}</b></div><div class="header-actions"><EnvironmentStatus v-if="store.receivedAt"/></div></header>
      <main :class="{'ui-review-main':tab==='ui'}"><div v-if="notice" class="notice" role="status"><CheckCircle2 :size="17"/>{{ notice }}<button aria-label="关闭提示" @click="notice=''">×</button></div><div v-if="tab!=='center'" class="project-task-header"><div><span class="eyebrow">{{ store.taskId }}</span><b>智慧校园项目验收</b></div><span><span class="status-dot"/>交付材料已关联 · v{{ campusProject.version }}</span></div>
        <TaskCenter v-if="tab==='center'" :store="store" :busy="!!busy" @receive="receive" @enter="navigate('overview')"/>
        <ProjectOverview v-else-if="tab==='overview'" :store="store" :busy="!!busy" @navigate="navigate"/>
        <UiTestWorkspace v-else-if="tab==='ui'" :checks="store.uiChecks" :busy="!!busy" @save="saveUi" @opened="openedUi"/>
        <ApiTestWorkspace v-else-if="tab==='api'" :store="store" :busy="!!busy || apiRunning" :running="apiRunning" :waiting="apiWaiting" :running-id="runningId" :progress="apiProgress" @parse="materialAction('parse')" @generate="materialAction('generate')" @run="runApi" @stop="stopApi" @edit="editApi" @manual="confirmApi"/>
        <PressureWorkspace v-else-if="tab==='load'" :endpoints="store.apiCases" :result="loadResult" :result-config="loadConfig" :busy="!!busy || loadRunning" :running="loadRunning" :report-available="!!latestLoadReport" @start="runLoad" @stop="stopLoad" @increase="increaseLoad" @report="loadReportId=store.latestLoadId" @export="latestLoadReport && exportReport(latestLoadReport,'json')"/>
        <SpecialTaskWorkspace v-else-if="tab==='special'" :store="store" :runs="specialRuns" :busy="!!busy || specialRunning" :busy-id="specialBusyId" :running="specialRunning" @generate="generateSpecial" @advance="advanceSpecial" @reset="resetSpecial" @report="saveSpecialReport" @cancel="stopSpecial" @note="saveSpecialNote" @manual="confirmSpecial"/>
        <AcceptanceReport v-else-if="tab==='reports'" :store="store" :busy="!!busy" @generate="generateAcceptance" @feedback="feedback" @json="exportAcceptance('json')" @html="exportAcceptance('html')" @open="openReport" @raw="rawReport"/>
      </main>
    </div>
    <UiReportView v-if="selectedUiReport" :report="selectedUiReport" @close="uiReportId=null" @json="exportUiReport(selectedUiReport.id)"/>
    <SpecialReportView v-if="selectedSpecialReport" :report="selectedSpecialReport" @close="specialReportId=null" @json="exportReport(selectedSpecialReport,'json')" @html="exportReport(selectedSpecialReport,'html')"/>
    <LoadReport v-if="selectedLoadReport" :report="selectedLoadReport" @close="loadReportId=null" @json="exportReport(selectedLoadReport,'json')" @html="exportReport(selectedLoadReport,'html')"/>
    <ModalFrame v-if="busy==='解析交付API材料' || busy==='生成API测试用例' || busy==='生成专项测试用例' || busy==='提交验收反馈'" :title="busy" @close="stop"><div class="process-panel"><LoaderCircle class="spinning" :size="35"/><h3>{{ busy }}</h3><ol class="processing-steps"><li v-for="(label,index) in processingSteps" :key="label" :class="{done:index<processingDone}"><CheckCircle2 :size="16"/>{{label}}</li></ol><button class="secondary" @click="stop">取消本次操作</button></div></ModalFrame>
    <ModalFrame v-if="busy==='正在接收项目交付'" title="接收项目交付" @close="controller?.abort()"><div class="process-panel"><LoaderCircle class="spinning" :size="35"/><h3>正在读取项目交付包</h3><p>识别项目名称与版本，读取交付材料。</p></div></ModalFrame>
    <ModalFrame v-if="resetOpen" title="重置讲解流程" @close="resetOpen=false"><div class="environment-body"><p>将清除本工作台的消息、任务草稿、检查与报告记录。</p><p>不会修改校园项目文件或校园预约/请假数据。请先导出需要保留的报告。</p></div><div class="dialog-footer"><button class="secondary" @click="resetOpen=false">保留当前记录</button><button class="primary" :disabled="!!busy" @click="reset">确认重置</button></div></ModalFrame>
  </div>
</template>
