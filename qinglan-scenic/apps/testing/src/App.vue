<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { LayoutDashboard, PackageOpen, Monitor, Code2, ShieldCheck, Gauge, FileCheck2, ChevronRight, LoaderCircle, RotateCcw, Send, CheckCircle2 } from 'lucide-vue-next';
import TaskCenter from './TaskCenter.vue';
import ProjectOverview from './ProjectOverview.vue';
import UiTestWorkspace from './UiTestWorkspace.vue';
import UiReportView from './UiReport.vue';
import { completeUiReport, uiReportDocument } from './ui-report';
import ApiTestWorkspace from './ApiTestWorkspace.vue';
import ApiReportView from './ApiReport.vue';
import TestWorkflowGuide from './TestWorkflowGuide.vue';
import type { TestStep } from './test-workflow';
import PressureWorkspace from './PressureWorkspace.vue';
import { loadOperationName } from './load-operations';
import SpecialTaskWorkspace from './SpecialTaskWorkspace.vue';
import SpecialGenerationDialog from './SpecialGenerationDialog.vue';
import { compileSpecialPlan, createCompiledSpecialRuns, specialGenerationDelay, type CompiledSpecialCase } from './special-plan';
import { runSpecialSequence, specialReportMatches } from './special-batch';
import AcceptanceReport from './AcceptanceReport.vue';
import { buildAcceptance, feedbackAcceptance, acceptanceDocument, acceptanceHtml } from './acceptance';
import { completeTask, taskProgress, taskSubmissionBlockers } from './task-lifecycle';
import SpecialReportView from './SpecialReport.vue';
import { SpecialSession, createRuns, createSpecialReport, type ScenarioId, type ScenarioRuns, type SpecialReport } from './special-engine';
import { specialReportHtml } from './special-report';
import LoadReport from './LoadReport.vue';
import { loadReportHtml } from './report-export';
import EnvironmentStatus from './EnvironmentStatus.vue';
import ModalFrame from './ModalFrame.vue';
import { campusProject, deliverySystem, apiMaterials, assignments } from './campus-handoff';
import { receiveDelivery, newTaskStore, appendEvent, touchTask, uiCheckKey, parseMaterials, generateApiCases, copy, type SpecialNote, type CheckResult, type CaseNote, type UiCheck, type CampusTaskStore } from './task-store';
import { delay, modelSample, startLoadSession, normalizeConfig, loadReportSummary, retainReports, reportDocument, type EndpointConfig, type Sample, type MeasurementReport, type LoadResult, type LoadSession, type LoadConfig, type Report } from './engine';
import { resolveEndpoints } from './systems';
import { apiDisplayTiming } from './api-display-timing';
import { restoreRuntimeTask, saveRuntimeTask } from './runtime-task';
import { createBufferedAutosave } from './buffered-autosave';
import { resetCampusDemo } from './campus-reset';
const store = ref<CampusTaskStore>(restoreRuntimeTask());
const autosave=createBufferedAutosave(()=>{const saved=saveRuntimeTask(store.value);if(!saved.saved)notice.value='浏览器无法保存进度，请先导出报告，避免刷新丢失。';});
// Mutators advance revision or replace these top-level snapshots. Do not deeply
// traverse every response/history bucket again for each API execution record.
watch(()=>[store.value,store.value.revision,store.value.specialRuns,store.value.acceptance,store.value.acceptance?.feedback,store.value.completion,store.value.timeline,store.value.reports,store.value.uiReports],()=>{if(executionRunning.value)autosave.schedule();else autosave.saveNow();},{flush:'post'});
function saveWhenHidden(){if(document.visibilityState==='hidden')autosave.saveNow();}
window.addEventListener('pagehide',autosave.saveNow);
document.addEventListener('visibilitychange',saveWhenHidden);
const tabs = [ { id: 'center', label: '任务中心', icon: LayoutDashboard }, { id: 'overview', label: '交付概览', icon: PackageOpen }, { id: 'ui', label: 'UI测试', icon: Monitor }, { id: 'api', label: 'API测试', icon: Code2 }, { id: 'load', label: '并发测试', icon: Gauge }, { id: 'special', label: '专项测试', icon: ShieldCheck }, { id: 'reports', label: '验收报告', icon: FileCheck2 } ] as const;
type Tab = typeof tabs[number]['id'];
const tab = ref<Tab>('center'), busy = ref<string | null>(null), notice = ref(''), resetOpen = ref(false);
const archiveView=ref(false);
// Viewing an archive never restores its evidence into the active testing workspace.
const reportStore=computed<CampusTaskStore>(()=>archiveView.value && store.value.archivedTask ? store.value.archivedTask : store.value);
let controller: AbortController | undefined;
let apiController:AbortController|undefined,loadController:AbortController|undefined,specialBatchController:AbortController|undefined;
const apiWaiting=ref(false);
const apiRunning=ref(false),loadRunning=ref(false),specialRunning=ref(false);
const executionRunning=computed(()=>apiRunning.value || loadRunning.value || specialRunning.value);
const anyRunning=computed(()=>!!busy.value || executionRunning.value);
const taskLocked=computed(()=>!!store.value.completion);
const editingDisabled=computed(()=>!!busy.value || taskLocked.value);
const currentTaskProgress=computed(()=>taskProgress(store.value,executionRunning.value));
const specialRuns = shallowRef<ScenarioRuns>(store.value.specialRuns || createRuns('campus')), specialBusyId=ref<ScenarioId|null>(null), specialReportId=ref<string|null>(null);
const specialBatchRunning=ref(false),specialActiveId=ref<ScenarioId>('duplicate');
const specialGenerationStage=ref(0),specialAssembled=ref<CompiledSpecialCase[]>([]);
let specialSession:SpecialSession;
function initSpecial(initial?:ScenarioRuns) { specialSession?.dispose();specialSession=new SpecialSession((runs,id)=>{specialRuns.value=runs;specialBusyId.value=id;store.value.specialRuns=copy(runs);},100,initial,'campus');specialRuns.value=specialSession.snapshot();specialActiveId.value='duplicate'; }
initSpecial(store.value.specialRuns || undefined);
const selectedSpecialReport=computed(()=>reportStore.value.reports.find(r=>r.id===specialReportId.value && r.kind==='special') as SpecialReport | undefined);
const runningId = ref<string|null>(null), apiProgress = ref(0), processingSteps = ref<string[]>([]), processingDone = ref(0);
const system = computed(() => ({...deliverySystem(), endpoints: store.value.apiCases.length ? copy(store.value.apiCases) : deliverySystem().endpoints}));
const loadResult = shallowRef<LoadResult|null>(null), loadReportId = ref<string|null>(null);
const loadConfig = ref<LoadConfig>();
const apiReportId=ref<string|null>(null);
const latestApiReport=computed(()=>store.value.reports.find((r):r is MeasurementReport=>r.kind==='suite' && r.taskId===store.value.taskId));
const selectedApiReport=computed(()=>reportStore.value.reports.find((r):r is MeasurementReport=>r.kind==='suite' && r.id===apiReportId.value));
let loadSession: LoadSession | undefined;
const selectedLoadReport = computed(() => reportStore.value.reports.find(r=>r.id===loadReportId.value && r.kind==='load') as MeasurementReport | undefined);
const latestLoadReport = computed(() => store.value.reports.find(r=>r.id===store.value.latestLoadId && r.kind==='load') as MeasurementReport | undefined);
function restoreLoad() { const r=latestLoadReport.value; loadConfig.value=r?.config ? copy(r.config) : undefined; loadResult.value=r ? {loadModel:r.loadModel,samples:r.samples,observations:r.observations,frames:r.frames,events:r.events,elapsedMs:r.elapsedMs,level:r.frames.at(-1)?.level || 0,phase:r.status,status:r.status} : null; }
restoreLoad();
function download(name:string, value:string, type:string) { const url=URL.createObjectURL(new Blob([value],{type})); const a=document.createElement('a'); a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000); }
function exportReport(report: Report, kind:'json'|'html') { download(`service-test-${report.kind}-${report.id}.${kind}`,kind==='json' ? JSON.stringify(reportDocument(report),null,2) : report.kind==='load' ? loadReportHtml(report) : report.kind==='special' ? specialReportHtml(report) : '',kind==='json'?'application/json':'text/html'); }
function archive(report: Report) { store.value.reports=retainReports(store.value.reports, report); touchTask(store.value); }
function stop() { controller?.abort(); }
function stopApi(){apiController?.abort();}
function stopLoad(){loadController?.abort();}
function stopSpecial(){specialBatchController?.abort();specialSession.cancel();}
async function generateSpecial() {
  if(taskLocked.value || busy.value || specialRunning.value || !store.value.receivedAt || store.value.specialGeneratedAt)return;
  busy.value='生成专项测试用例';specialGenerationStage.value=0;specialAssembled.value=[];
  const current=new AbortController();controller=current;
  try{
    const step=(ms:number)=>delay(specialGenerationDelay(ms),current.signal);
    await step(450);
    specialGenerationStage.value=1;const plan=compileSpecialPlan();await step(400);
    specialGenerationStage.value=2;
    for(const item of plan){await step(220);specialAssembled.value.push(item);}
    specialGenerationStage.value=3;await step(450);
    const compiled=createCompiledSpecialRuns(plan);
    specialGenerationStage.value=4;await step(250);
    specialGenerationStage.value=5;await step(120);
    initSpecial(compiled);store.value.specialGeneratedAt=new Date().toISOString();store.value.specialRuns=copy(compiled);touchTask(store.value);
    appendEvent(store.value,'生成专项测试用例',`4项后端指派 → ${plan.length} 项本地模板编排，准备条件、请求与断言已关联，尚未执行`);
    notice.value='专项用例已生成，可点击“一键测试”按顺序执行，或逐项手动核验。';
  }catch(error){notice.value=current.signal.aborted?'专项生成已取消，未发布测试用例。':`专项生成失败：${String(error)}`;}
  finally{busy.value=null;controller=undefined;}
}
function recordSpecialStep(id:ScenarioId,step:number){
  touchTask(store.value);
  appendEvent(store.value,`${assignments.find(a=>a.id===id)!.title} · ${['准备条件','触发请求','核验结果'][step]}`,`${specialRuns.value[id].events.length} 条过程记录 · 当前进度 ${specialRuns.value[id].step}/3`);
}
function specialAllDone(){return assignments.every(item=>specialRuns.value[item.id].step===3);}
async function advanceSpecial(id:ScenarioId,step:number) {
  if(taskLocked.value || busy.value || specialRunning.value || !store.value.specialGeneratedAt || !assignments.some(a=>a.id===id))return;
  specialActiveId.value=id;specialRunning.value=true;touchTask(store.value);
  try{
    if(await specialSession.advance(id,step))recordSpecialStep(id,step);
    else{touchTask(store.value);appendEvent(store.value,'专项操作已取消','当前场景已重置，其他场景保留');}
  }catch(error){notice.value=`专项操作暂停：${String(error)}`;}
  finally{specialRunning.value=false;if(specialAllDone())saveSpecialReport(false);}
}
async function runAllSpecial(){
  if(taskLocked.value || busy.value || specialRunning.value || !store.value.specialGeneratedAt || specialAllDone())return;
  const current=new AbortController();specialBatchController=current;specialBatchRunning.value=true;specialRunning.value=true;touchTask(store.value);
  appendEvent(store.value,'开始专项一键测试','按后端指派顺序执行未完成场景；准备条件 → 触发请求 → 核验结果');
  let completed=false;
  try{
    completed=await runSpecialSequence(specialSession,assignments.map(item=>item.id),{signal:current.signal,onScenario:id=>{specialActiveId.value=id;},onStep:recordSpecialStep});
    // Stopping during the final verdict's visual pause must not discard fully verified evidence.
    completed ||= specialAllDone();
    touchTask(store.value);
    appendEvent(store.value,completed?'专项一键测试已完成':'专项一键测试已停止',completed?'4项场景已顺序核验；人工补充检查仍需独立确认':'保留已核验场景，当前未完成场景可重新测试，未执行项不会计为通过');
    notice.value=completed?'4 项专项测试已全部完成，报告已保存，可点击“查看报告”。':'一键测试已停止，已完成场景保留，可继续执行剩余场景。';
  }catch(error){notice.value=`专项一键测试暂停：${String(error)}`;}
  finally{specialRunning.value=false;specialBatchRunning.value=false;specialBatchController=undefined;if(completed)saveSpecialReport(false);}
}
function resetSpecial(id:ScenarioId,parameter?:string) {if(taskLocked.value || busy.value || specialRunning.value)return;specialSession.reset(id,parameter);const old=store.value.specialNotes[id];if(old)old.result='pending';touchTask(store.value);appendEvent(store.value,'重置专项场景',`${assignments.find(a=>a.id===id)?.title} · 参数 ${specialRuns.value[id].parameter}，等待重测`);}
function saveSpecialNote(id:ScenarioId,value:SpecialNote) {if(taskLocked.value || busy.value || specialRunning.value)return;store.value.specialNotes[id]={...copy(value),result:'pending'};touchTask(store.value);appendEvent(store.value,'调整专项用例补充',`${assignments.find(a=>a.id===id)?.title} · 补充检查等待人工确认`);if(specialAllDone())saveSpecialReport(false);}
function confirmSpecial(id:ScenarioId,result:CheckResult) {if(taskLocked.value || busy.value || specialRunning.value || specialRuns.value[id].step!==3 || !store.value.specialNotes[id]?.checkpoint)return;store.value.specialNotes[id]!.result=result;touchTask(store.value);appendEvent(store.value,'确认专项人工检查',`${assignments.find(a=>a.id===id)?.title} · ${result==='passed'?'通过':'需整改'}`);if(specialAllDone())saveSpecialReport(false);}
function saveSpecialReport(open=true) {
  if(taskLocked.value || busy.value || specialRunning.value || !assignments.some(item=>specialRuns.value[item.id].step===3))return;
  const ids=assignments.map(item=>item.id);
  let report=store.value.reports.find((item):item is SpecialReport=>item.kind==='special' && item.taskId===store.value.taskId && specialReportMatches(item,specialRuns.value,ids,store.value.specialNotes));
  if(!report){
    report=createSpecialReport(system.value,specialRuns.value,ids);report.taskId=store.value.taskId;report.handoffId=store.value.handoffId;report.caseNotes=copy(store.value.specialNotes);archive(report);
    appendEvent(store.value,'生成专项验收报告',`${report.scenarios.filter(run=>run.step===3).length}/4 场景已核验，快照已保存`);
  }
  if(open)specialReportId.value=report.id;
}
async function materialAction(action:'parse'|'generate') {
  if (taskLocked.value || busy.value || !store.value.receivedAt || action==='parse' && store.value.apiParsedAt || action==='generate' && (!store.value.apiParsedAt || store.value.apiGeneratedAt)) return;
  busy.value=action==='parse'?'解析交付API材料':'生成API测试用例'; processingSteps.value=action==='parse' ? ['读取项目API交付清单','识别方法、岗位和请求参数','关联响应示例与验收标准'] : ['按接口用途建立测试项','映射响应契约和耗时预算','用例已就绪，等待手动运行']; processingDone.value=0;
  const current=new AbortController();controller=current;
  try { for (let i=0;i<processingSteps.value.length;i++) { await delay(400,current.signal); processingDone.value=i+1; } if (action==='parse') parseMaterials(store.value); else generateApiCases(store.value); notice.value=action==='parse'?'API材料已解析，请手动生成测试用例。':'API用例已生成，尚未执行测试。'; }
  catch {notice.value='操作已取消，未提交本轮材料处理结果。';} finally {busy.value=null;}
}
function editApi(config: EndpointConfig, note: CaseNote) { if(taskLocked.value || busy.value || apiRunning.value)return; const index=store.value.apiCases.findIndex(c=>c.id===config.id);if(index<0)return;store.value.apiCases[index]=copy(config);store.value.apiNotes[config.id]={...copy(note),result:'pending'};delete store.value.apiResults[config.id];touchTask(store.value);appendEvent(store.value,'调整API用例',`${config.name} · 旧结果已清除，等待重测`);notice.value='用例已更新，需重新执行；人工补充检查不会自动通过。'; }
function confirmApi(id:string,result:CheckResult) { if(taskLocked.value || busy.value || apiRunning.value || !store.value.apiNotes[id]?.checkpoint || !store.value.apiResults[id] || store.value.apiResults[id].outcome==='cancelled')return;store.value.apiNotes[id].result=result;touchTask(store.value);appendEvent(store.value,'人工补充API检查',`${store.value.apiCases.find(c=>c.id===id)?.name} · ${result==='passed'?'通过':'需整改'}`); }
async function runApi(ids:string[]) {
  if(taskLocked.value || busy.value || apiRunning.value || !store.value.apiGeneratedAt)return;const snapshot=copy(system.value);const targets=resolveEndpoints(snapshot).filter(e=>ids.includes(e.id));if(!targets.length)return;
  apiRunning.value=true;apiProgress.value=0;const current=new AbortController();apiController=current;
  for(const target of targets)delete store.value.apiResults[target.id];touchTask(store.value);const start=performance.now(),startedAt=new Date().toISOString(),samples:Sample[]=[];
  const timing=apiDisplayTiming(targets.length);
  let dueAt=start;
  appendEvent(store.value,'开始API验证',`手动运行 ${targets.length} 项用例`);
  try {for(const [index,endpoint] of targets.entries()) { if(current.signal.aborted)break;runningId.value=endpoint.id; if(store.value.apiNotes[endpoint.id]?.checkpoint)store.value.apiNotes[endpoint.id].result='pending'; let sample:Sample;
    try {apiWaiting.value=timing[index].stalled;dueAt+=timing[index].delayMs;await delay(Math.max(0,dueAt-performance.now()),current.signal);apiWaiting.value=false;sample=modelSample(endpoint,index,0,0,20,'model');}catch{sample={endpointId:endpoint.id,source:'model',at:new Date().toISOString(),elapsedMs:0,status:null,outcome:'cancelled',checks:[],requestId:`cancelled-${endpoint.id}`,bytes:0,preview:'',error:'本轮已取消'};}
    if(sample.outcome==='cancelled')sample={...sample,status:null,preview:'',checks:[],bytes:0};store.value.apiResults[endpoint.id]=sample;touchTask(store.value);samples.push(sample);apiProgress.value=samples.filter(s=>s.outcome!=='cancelled').length/targets.length*100;
  }} finally { const stopped=current.signal.aborted;archive({id:crypto.randomUUID(),kind:'suite',system:snapshot,taskId:store.value.taskId,handoffId:store.value.handoffId,caseNotes:copy(store.value.apiNotes),startedAt,elapsedMs:performance.now()-start,status:stopped?'stopped':'completed',samples,observations:[],frames:[],events:[]});appendEvent(store.value,stopped?'API测试已停止':'API验证完成',`${samples.filter(s=>s.outcome==='passed').length} 项通过 / ${samples.filter(s=>s.outcome==='failed').length} 项未通过 · 下一项测试等待手动发起`);notice.value=stopped?'API测试已停止，已完成记录保留。':'本轮API验证已完成，报告与执行记录已保存，可点击“查看API测试报告”。';runningId.value=null;apiWaiting.value=false;apiRunning.value=false;apiController=undefined;autosave.saveNow(); }
}
async function runLoad(input:LoadConfig) { if(taskLocked.value || busy.value || loadRunning.value || !store.value.apiGeneratedAt)return;const snapshot=copy(system.value), config=normalizeConfig(input,resolveEndpoints(snapshot)), startedAt=new Date().toISOString();loadConfig.value=copy(config);loadRunning.value=true;store.value.latestLoadId=null;touchTask(store.value);const current=new AbortController();loadController=current;appendEvent(store.value,'开始并发测试',`${loadOperationName(snapshot.endpoints,config.endpointId)} · 预期 ${config.concurrency} / 安全上限 ${config.maxConcurrency || config.concurrency} / ${config.duration} 秒 · 本地模型`);loadSession=startLoadSession(snapshot,config,current.signal,value=>{loadResult.value=value;});try{const result=await loadSession.completion;const report:MeasurementReport={loadModel:result.loadModel,id:crypto.randomUUID(),kind:'load',system:snapshot,taskId:store.value.taskId,handoffId:store.value.handoffId,startedAt,elapsedMs:result.elapsedMs,status:result.status==='completed'?'completed':'stopped',samples:result.samples,observations:result.observations,frames:result.frames,events:result.events,config};archive(report);store.value.latestLoadId=report.id;const goal=loadReportSummary(report).goal;appendEvent(store.value,result.status==='completed'?'并发测试完成':'并发测试已停止',`${goal.verdictLabel} · ${goal.reason}`);if(goal.issues.length)appendEvent(store.value,'记录并发目标问题',`${goal.issues.join('；')} 汇总后随验收反馈提交。`);notice.value='';}catch(error){notice.value=`并发测试暂停：${String(error)}`;}finally{loadRunning.value=false;loadController=undefined;loadSession=undefined;} }
function increaseLoad() { if(loadRunning.value && loadSession?.increase())appendEvent(store.value,'手动加压一级',`当前第 ${loadResult.value?.level} 级`); }
function navigate(value: Tab) { if (busy.value || value !== 'center' && !store.value.receivedAt) return; archiveView.value=false;tab.value = value; }
function nextTest(value:TestStep|'reports') {
  if(anyRunning.value || taskLocked.value)return;
  appendEvent(store.value,'记录测试并进入下一项',`${tabs.find(item=>item.id===tab.value)?.label}记录已自动保存 → ${tabs.find(item=>item.id===value)?.label}`);
  navigate(value);
}
function openTaskReport(){
  if(busy.value)return;
  archiveView.value=!!store.value.archivedTask;
  tab.value='reports';
}
async function receive() {
  if (busy.value) return;
  if (store.value.receivedAt) { tab.value = 'overview'; notice.value = '本版本已接收，已打开原测试任务。'; return; }
  busy.value = '正在接收项目交付'; const current = new AbortController(); controller = current;
  try { await delay(650, current.signal); receiveDelivery(store.value); notice.value = ''; }
  catch { notice.value = '接收已取消，未创建任务。'; } finally { busy.value = null; }
}
const uiReportId=ref<string|null>(null);
const selectedUiReport=computed(()=>reportStore.value.uiReports?.find(r=>r.id===uiReportId.value));
function exportUiReport(id:string){const report=reportStore.value.uiReports?.find(r=>r.id===id);if(report)download(`${report.id}.json`,JSON.stringify(uiReportDocument(report),null,2),'application/json');}
const uiDone = computed(() => Object.values(store.value.uiChecks).filter(check => check.result !== 'pending').length);
const apiDone = computed(() => Object.values(store.value.apiResults).filter(result => result.outcome !== 'cancelled').length);
function status(id: Tab) { if(id==='api' && apiRunning.value)return `运行中 ${Math.round(apiProgress.value)}%`;if(id==='load' && loadRunning.value)return '并发测试中';if(id==='special' && specialRunning.value)return '执行中'; if (!store.value.receivedAt) return '待接收'; if (id === 'ui') return uiDone.value ? `${uiDone.value} 项已检查` : '待检查'; if (id === 'api') return apiDone.value ? `${apiDone.value} 项已执行` : store.value.apiGeneratedAt ? '待执行' : '待生成'; if (id === 'special') {const done=assignments.filter(a=>store.value.specialRuns?.[a.id].step===3).length;return done?`${done}/4 已核验`:store.value.specialGeneratedAt?'待执行':'待生成';} if (id === 'load') return latestLoadReport.value?.status==='completed'?'已完成':store.value.latestLoadId?'阶段记录':'待执行'; if (id === 'reports') return taskLocked.value?'已归档':store.value.acceptance && store.value.acceptance.revision!==store.value.revision ? '需重新汇总' : store.value.acceptance?.feedback ? '已反馈' : store.value.acceptance ? '待反馈' : '待汇总'; return '已接收'; }
function saveUi(checks: UiCheck[], openReport=true) {
  if (taskLocked.value || busy.value || !store.value.receivedAt) return;
  for (const check of checks) store.value.uiChecks[uiCheckKey(check.pageId, check.index)] = check;
  touchTask(store.value); appendEvent(store.value, '保存UI检查', `${campusProject.pages.find(p=>p.id===checks[0]?.pageId)?.name} · ${checks.filter(c=>c.result==='passed').length} 项通过 / ${checks.filter(c=>c.result==='issue').length} 项需整改`);
  notice.value = '页面检查已保存，需整改项将汇入验收报告。';
  const report=completeUiReport(store.value);
  if(report){
    store.value.uiReports=[report,...(store.value.uiReports || [])].slice(0,8);
    appendEvent(store.value,'UI测试完成',`${report.total} 项检查 · ${report.passed} 通过 / ${report.issues} 需整改 · 报告已归档`);
    notice.value='五端检查已完成并保存，报告已归档，可点击“查看报告”。';
    if(openReport)uiReportId.value=report.id;
  }
}
function openedUi(name: string) { appendEvent(store.value, '打开项目UI', `${name} · 内嵌预览，等待人工检查`); }
function generateAcceptance() {if(taskLocked.value || busy.value || !store.value.receivedAt)return;store.value.acceptance=buildAcceptance(store.value);appendEvent(store.value,'汇总验收报告',`${store.value.acceptance.issues.length} 项需整改 / ${store.value.acceptance.untested.length} 项未测，已生成独立快照`);notice.value='综合报告已汇总，确认后可手动提交反馈。';}
async function feedback() {if(taskLocked.value || executionRunning.value || busy.value || !store.value.acceptance || store.value.acceptance.revision!==store.value.revision || store.value.acceptance.feedback)return;busy.value='提交验收反馈';processingSteps.value=['整理本轮检查与问题清单','关联项目版本与接收岗位','记录验收反馈回执'];processingDone.value=0;const current=new AbortController();controller=current;try{for(let i=0;i<3;i++){await delay(400,current.signal);processingDone.value=i+1;}if(feedbackAcceptance(store.value)){appendEvent(store.value,'验收反馈已记录',`${store.value.acceptance!.feedback!.id} · ${store.value.acceptance!.feedback!.status}`);notice.value='验收反馈已记录，本轮材料与回执已关联。';}}catch{notice.value='反馈已取消，报告仍保留，未生成回执。';}finally{busy.value=null;}}
async function submitTask() {
  if(busy.value)return;
  const blockers=taskSubmissionBlockers(store.value,executionRunning.value);
  if(blockers.length){notice.value=blockers.join(' ');return;}
  busy.value='提交任务报告';processingSteps.value=['核对计划检查与最新报告','关联问题清单和交付反馈','生成本地归档回执并完结任务'];processingDone.value=0;
  const current=new AbortController();controller=current;
  try{
    for(let i=0;i<3;i++){await delay(400,current.signal);processingDone.value=i+1;}
    if(completeTask(store.value,executionRunning.value)){
      // Reset transient controls as well as persisted working data; do not call the global reset.
      uiReportId.value=null;specialReportId.value=null;loadReportId.value=null;apiReportId.value=null;
      loadResult.value=null;loadConfig.value=undefined;apiProgress.value=0;runningId.value=null;apiWaiting.value=false;
      initSpecial();specialBusyId.value=null;archiveView.value=false;tab.value='center';
      notice.value='';
    }
    else notice.value='提交条件已变化，任务未完结，请重新核对报告。';
  }catch{notice.value='提交已取消，未完结任务，报告与测试记录仍保留。';}finally{busy.value=null;}
}
function exportAcceptance(kind:'json'|'html') {const source=reportStore.value,report=source.acceptance;if(!report)return;download(`campus-acceptance-${report.id}.${kind}`,kind==='json'?JSON.stringify(acceptanceDocument(report,source.completion),null,2):acceptanceHtml(report,source.completion),kind==='json'?'application/json':'text/html');}
function openReport(id:string) {if(reportStore.value.uiReports?.some(r=>r.id===id)){uiReportId.value=id;return;}const r=reportStore.value.reports.find(r=>r.id===id);if(r?.kind==='load')loadReportId.value=id;else if(r?.kind==='special')specialReportId.value=id;else if(r?.kind==='suite')apiReportId.value=id;}
function rawReport(id:string) {if(reportStore.value.uiReports?.some(r=>r.id===id)){exportUiReport(id);return;}const r=reportStore.value.reports.find(r=>r.id===id);if(r)exportReport(r,'json');}
async function reset() {
  if (anyRunning.value) return;
  busy.value = '正在重置工作台与智慧校园';
  notice.value = '正在清理校园测试数据，请稍候…';
  try {
    await resetCampusDemo();
    store.value = newTaskStore(); archiveView.value=false;uiReportId.value=null;apiReportId.value=null; initSpecial(); specialReportId.value=null; loadResult.value=null; loadConfig.value=undefined; loadReportId.value=null; resetOpen.value = false; tab.value = 'center';
    notice.value = '工作台与智慧校园已重置：测试新增的预约、请假及审批记录已清除，仅保留预置历史。已打开的校园页面将自动刷新。';
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '重置失败，工作台记录已保留，请重试。';
  } finally { busy.value = null; }
}
onBeforeUnmount(() => { controller?.abort();apiController?.abort();loadController?.abort();specialBatchController?.abort();specialSession.dispose();autosave.saveNow();autosave.dispose();window.removeEventListener('pagehide',autosave.saveNow);document.removeEventListener('visibilitychange',saveWhenHidden); });
</script>
<template>
  <div class="workbench-shell"><aside class="workbench-sidebar"><a class="brand" href="#" @click.prevent="navigate('center')"><span class="brand-icon"><ShieldCheck :size="27"/></span><div><b>质量测试工作台</b><small>QUALITY WORKBENCH</small></div></a><div class="sidebar-project"><span class="eyebrow">当前测试项目</span><template v-if="taskLocked"><b>暂无进行中任务</b><p>{{ campusProject.name }} · 报告已归档</p></template><template v-else-if="store.receivedAt"><b>{{ campusProject.name }} <span>v{{ campusProject.version }}</span></b><p>{{ campusProject.brand }} · {{ currentTaskProgress?.label }}</p></template><template v-else><b>等待接收项目</b><p>接收交付后显示项目信息</p></template></div><nav aria-label="测试工作台导航"><button v-for="item in tabs" :key="item.id" :disabled="!!busy || item.id !== 'center' && !store.receivedAt" :class="{active:tab===item.id}" :aria-current="tab===item.id ? 'page' : undefined" @click="navigate(item.id)"><component :is="item.icon" :size="18"/><span>{{ item.label }}</span><i v-if="item.id==='center' && store.receivedAt && !taskLocked">1</i><small v-else-if="item.id!=='center'">{{ status(item.id) }}</small></button></nav><div class="sidebar-footer"><button class="avatar" aria-label="立即重置工作台" title="重置工作台与智慧校园，清除所有测试更改并恢复预置历史" :disabled="anyRunning" @click="reset">测</button><div><b>测试工程师</b><small>进度自动保存 · 刷新不清空</small></div></div></aside>
    <div class="workbench-main"><header class="workbench-header"><div class="breadcrumb">工作台<ChevronRight :size="14"/><b>{{ tabs.find(item=>item.id===tab)?.label }}</b></div><TestWorkflowGuide v-if="store.receivedAt && !taskLocked && tab!=='center' && tab!=='reports'" :store="store" :sections="currentTaskProgress?.sections" :current="tab" :busy="!!busy" :running="executionRunning" @navigate="navigate" @next="nextTest"/><div class="header-actions"><button v-if="taskLocked && tab!=='center'" class="text-button archive-navigation" :disabled="!!busy" @click="archiveView?navigate('center'):openTaskReport()">{{archiveView?'返回任务中心':'查看已归档报告'}}</button><EnvironmentStatus v-if="store.receivedAt"/></div></header>
      <main :class="{'ui-review-main':tab==='ui','api-review-main':tab==='api'}"><div v-if="notice" class="notice" role="status"><CheckCircle2 :size="17"/>{{ notice }}<button aria-label="关闭提示" @click="notice=''">×</button></div>
        <TaskCenter v-if="tab==='center'" :store="store" :busy="!!busy" :running="executionRunning" @receive="receive" @enter="navigate('overview')" @report="openTaskReport"/>
        <ProjectOverview v-else-if="tab==='overview'" :store="store" :busy="!!busy" @navigate="navigate"/>
        <UiTestWorkspace v-else-if="tab==='ui'" :checks="store.uiChecks" :report="store.uiReports?.[0]" :busy="editingDisabled" @save="saveUi" @opened="openedUi" @report="uiReportId=$event"/>
        <ApiTestWorkspace v-else-if="tab==='api'" :store="store" :busy="editingDisabled || apiRunning" :running="apiRunning" :waiting="apiWaiting" :running-id="runningId" :progress="apiProgress" :report-available="!!latestApiReport" @report="apiReportId=latestApiReport?.id || null" @parse="materialAction('parse')" @generate="materialAction('generate')" @run="runApi" @stop="stopApi" @edit="editApi" @manual="confirmApi"/>
        <PressureWorkspace v-else-if="tab==='load'" :endpoints="store.apiCases" :result="loadResult" :result-config="loadConfig" :busy="editingDisabled || loadRunning" :running="loadRunning" :report-available="!!latestLoadReport" :report="latestLoadReport" @start="runLoad" @stop="stopLoad" @increase="increaseLoad" @report="loadReportId=store.latestLoadId" @export="latestLoadReport && exportReport(latestLoadReport,'json')"/>
        <SpecialTaskWorkspace v-else-if="tab==='special'" :store="store" :runs="specialRuns" :busy="editingDisabled || specialRunning" :busy-id="specialBusyId" :running="specialRunning" :batch="specialBatchRunning" :active-id="specialActiveId" @select="specialActiveId=$event" @generate="generateSpecial" @run="runAllSpecial" @advance="advanceSpecial" @reset="resetSpecial" @report="saveSpecialReport()" @cancel="stopSpecial" @note="saveSpecialNote" @manual="confirmSpecial"/>
        <AcceptanceReport v-else-if="tab==='reports'" :store="reportStore" :busy="!!busy" :running="executionRunning" @generate="generateAcceptance" @feedback="feedback" @submit="submitTask" @center="navigate('center')" @json="exportAcceptance('json')" @html="exportAcceptance('html')" @open="openReport" @raw="rawReport"/>
      </main>
    </div>
    <ApiReportView v-if="selectedApiReport" :report="selectedApiReport" @close="apiReportId=null" @json="exportReport(selectedApiReport,'json')"/>
    <UiReportView v-if="selectedUiReport" :report="selectedUiReport" @close="uiReportId=null" @json="exportUiReport(selectedUiReport.id)"/>
    <SpecialReportView v-if="selectedSpecialReport" :report="selectedSpecialReport" @close="specialReportId=null" @json="exportReport(selectedSpecialReport,'json')" @html="exportReport(selectedSpecialReport,'html')"/>
    <LoadReport v-if="selectedLoadReport" :report="selectedLoadReport" @close="loadReportId=null" @json="exportReport(selectedLoadReport,'json')" @html="exportReport(selectedLoadReport,'html')" @feedback="archiveView ? openTaskReport() : navigate('reports')"/>
    <SpecialGenerationDialog v-if="busy==='生成专项测试用例'" :stage="specialGenerationStage" :assembled="specialAssembled" @cancel="stop"/>
    <ModalFrame v-if="busy==='解析交付API材料' || busy==='生成API测试用例' || busy==='提交验收反馈' || busy==='提交任务报告'" :title="busy" @close="stop"><div class="process-panel"><LoaderCircle class="spinning" :size="35"/><h3>{{ busy }}</h3><ol class="processing-steps"><li v-for="(label,index) in processingSteps" :key="label" :class="{done:index<processingDone}"><CheckCircle2 :size="16"/>{{label}}</li></ol><button class="secondary" @click="stop">取消本次操作</button></div></ModalFrame>
    <ModalFrame v-if="busy==='正在接收项目交付'" title="接收项目交付" @close="controller?.abort()"><div class="process-panel"><LoaderCircle class="spinning" :size="35"/><h3>正在读取项目交付包</h3><p>识别项目名称与版本，读取交付材料。</p></div></ModalFrame>
    <ModalFrame v-if="resetOpen" title="重置讲解流程" @close="resetOpen=false"><div class="environment-body"><p>将清除本工作台的消息、任务草稿、检查与报告记录。</p><p>同时清除智慧校园测试新增的预约、请假及审批记录，各端恢复预置历史，所有测试更改将丢失。请先导出需要保留的报告。</p></div><div class="dialog-footer"><button class="secondary" @click="resetOpen=false">保留当前记录</button><button class="primary" :disabled="!!busy" @click="reset">确认重置</button></div></ModalFrame>
  </div>
</template>
<style scoped>
.workbench-header { gap:18px; }
.breadcrumb,.header-actions { flex-shrink:0; }
.archive-navigation { font-size:11px; white-space:nowrap; }
@media(max-width:1250px) { .workbench-header { gap:10px; padding-inline:20px; }.header-actions { gap:10px; } }
@media(max-width:700px) { .workbench-header { gap:8px; padding-inline:12px; }.breadcrumb { gap:5px; font-size:10px; }.archive-navigation { font-size:10px; }.header-actions { gap:6px; } }
</style>
