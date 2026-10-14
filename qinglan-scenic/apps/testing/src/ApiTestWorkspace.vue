<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Play, Square, Search, Code2, PencilLine, Eye, CheckCircle2, FileSearch, Sparkles, FileJson, LoaderCircle, ArrowRight } from 'lucide-vue-next';
import ApiMaterialPanel from './ApiMaterialPanel.vue';
import ModalFrame from './ModalFrame.vue';
import { apiMaterials, apiTestMaterials, API_CASE_COUNT } from './campus-handoff';
import type { CampusTaskStore, CaseNote, CheckResult } from './task-store';
import type { EndpointConfig } from './types';
const props = defineProps<{ store: CampusTaskStore; busy: boolean; running: boolean; waiting?: boolean; runningId: string | null; progress: number; reportAvailable?: boolean }>();
const emit = defineEmits<{ report: []; parse: []; generate: []; run: [ids: string[]]; stop: []; edit: [config: EndpointConfig, note: CaseNote]; manual: [id: string, result: CheckResult] }>();
const search=ref(''), group=ref('all'), selected=ref('delivery-health'), inspected=ref<string|null>(null);
const editing=ref<{config:EndpointConfig;note:CaseNote}|null>(null), error=ref('');
const tableViewport=ref<HTMLElement|null>(null);
const materialById=new Map(apiTestMaterials.map(item=>[`delivery-${item.id}`,item]));
const groups=[...new Set(apiMaterials.map(item=>item.group))];
const imported=computed<EndpointConfig[]>(()=>!props.store.apiParsedAt?[]:props.store.apiGeneratedAt?props.store.apiCases:apiMaterials.map(item=>({id:`delivery-${item.id}`,name:item.name,method:item.method,path:item.path,status:item.status,budget:500})));
const visible=computed(()=>imported.value.filter(item=>(group.value==='all' || materialById.get(item.id)?.group===group.value) && `${item.name} ${item.path} ${item.method}`.toLowerCase().includes(search.value.toLowerCase())));
const selectedEntry=computed(()=>visible.value.find(item=>item.id===selected.value));
const selectedCase=computed(()=>props.store.apiCases.find(item=>item.id===selected.value));
const material=computed(()=>materialById.get(selected.value));
const selectedSample=computed(()=>selectedCase.value?props.store.apiResults[selectedCase.value.id]:undefined);
const sample=computed(()=>inspected.value?props.store.apiResults[inspected.value]:undefined);
const inspectedCase=computed(()=>props.store.apiCases.find(item=>item.id===inspected.value));
const inspectedMaterial=computed(()=>inspected.value?materialById.get(inspected.value):undefined);
const recorded=computed(()=>Object.keys(props.store.apiResults).length);
watch(visible,items=>{if(!items.some(item=>item.id===selected.value))selected.value=items[0]?.id || '';},{immediate:true});
watch(()=>props.runningId,async id=>{
  if(!id)return;
  selected.value=id;
  await nextTick();
  const viewport=tableViewport.value;
  const row=Array.from(viewport?.querySelectorAll<HTMLElement>('tr[data-case-id]') || []).find(item=>item.dataset.caseId===id);
  if(viewport && row){
    const header=viewport.querySelector('thead')?.getBoundingClientRect().height || 0;
    viewport.scrollTop+=row.getBoundingClientRect().top-viewport.getBoundingClientRect().top-header;
  }
},{immediate:true});
function edit(id:string){
  const config=props.store.apiCases.find(item=>item.id===id);
  if(!config || props.busy)return;
  selected.value=id;
  editing.value={config:{...config},note:{...(props.store.apiNotes[id] || {note:'',checkpoint:'',result:'pending'})}};
  error.value='';
}
function saveEdit(){
  const value=editing.value;if(!value)return;
  if(!value.config.name.trim() || value.config.name.length>80 || !Number.isInteger(value.config.status) || value.config.status<100 || value.config.status>599 || !Number.isFinite(value.config.budget) || value.config.budget<1 || value.config.budget>60000){error.value='名称、预期状态码或响应阈值无效。';return;}
  emit('edit',value.config,value.note);editing.value=null;
}
const resultName=(id:string)=>!props.store.apiResults[id]?'待测试':({passed:'通过',failed:'未通过',cancelled:'已取消'})[props.store.apiResults[id].outcome];
function runOne(id:string){selected.value=id;emit('run',[id]);}
</script>
<template>
  <div class="section-intro api-intro"><div><span class="eyebrow">API MATERIAL / CONTRACT VERIFICATION</span><h1>从交付材料，生成可解释的测试。</h1><p>解析导入接口 → 生成场景用例 → 手动执行验证。所有操作与证据集中在一处。</p></div><span class="badge">{{recorded}} / {{store.apiGeneratedAt?store.apiCases.length:0}} 项有执行记录</span></div>
  <section class="panel api-material-panel api-workbench" :class="{'api-executing':running}" aria-label="API材料与测试工作台">
    <div class="panel-heading api-workbench-heading"><div><h2><FileJson :size="18"/>随项目交付的API材料</h2><p>{{store.apiGeneratedAt?`${apiMaterials.length} 项交付接口 · ${store.apiCases.length} 项场景用例` : store.apiParsedAt?`已导入 ${apiMaterials.length} 项接口，等待生成测试用例`:'尚未导入接口，请先解析本轮交付材料'}}</p></div>
      <div class="toolbar-actions">
        <button class="secondary" :disabled="busy || !!store.apiParsedAt" @click="emit('parse')"><FileSearch :size="15"/>{{store.apiParsedAt?'材料已解析':'解析API材料'}}</button>
        <button class="secondary" :disabled="busy || !store.apiParsedAt || !!store.apiGeneratedAt" @click="emit('generate')"><Sparkles :size="15"/>{{store.apiGeneratedAt?'用例已生成':'生成测试用例'}}</button>
        <button v-if="running" class="secondary stop-api" @click="emit('stop')"><Square :size="14"/>停止API测试</button>
        <button class="primary" :disabled="busy || !store.apiGeneratedAt || !visible.length" @click="emit('run',visible.map(item=>item.id))"><Play :size="15"/>{{group==='all' && !search?'运行全部API':'运行筛选用例'}}</button>
      </div>
    </div>
    <div v-if="reportAvailable && !running" class="api-report-entry"><span>最近一次API执行报告已保存，可查看结果或继续下一项测试。</span><button class="secondary" :disabled="busy" @click="emit('report')"><FileJson :size="15"/>查看API测试报告</button></div>
    <div class="api-stage-track" aria-label="API操作进度">
      <span :class="{done:store.apiParsedAt}"><CheckCircle2 v-if="store.apiParsedAt" :size="14"/><i v-else>1</i>解析材料<b>{{store.apiParsedAt?apiMaterials.length:0}} 项接口</b></span><ArrowRight :size="13"/>
      <span :class="{done:store.apiGeneratedAt}"><CheckCircle2 v-if="store.apiGeneratedAt" :size="14"/><i v-else>2</i>生成用例<b>{{store.apiGeneratedAt?store.apiCases.length:0}} 项用例</b></span><ArrowRight :size="13"/>
      <span :class="{done:recorded>0,active:running}"><LoaderCircle v-if="running" :size="14" class="spinning"/><CheckCircle2 v-else-if="recorded" :size="14"/><i v-else>3</i>执行验证<b>{{recorded}} 项记录</b></span>
    </div>
    <div v-if="running" class="run-progress" role="progressbar" aria-label="API执行进度" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100">
      <div><span><LoaderCircle :size="15" class="spinning"/>{{runningId?store.apiCases.find(item=>item.id===runningId)?.name:'正在整理执行记录'}}</span><b>{{Math.round(progress)}}%</b></div>
      <div class="progress-track"><i :style="{width:`${progress}%`}"/></div>
      <p>{{waiting?'模拟网络等待…进度稍停后继续（本地演示）':'快速验证中 · 含短暂网络波动演示，不发送真实测试请求'}}</p>
    </div>
    <div v-if="!store.apiParsedAt" class="empty-state api-import-empty"><FileJson :size="36"/><h3>尚未导入API</h3><p>点击上方“解析API材料”导入交付接口。<br/>解析完成后再生成 {{API_CASE_COUNT}} 项测试用例，不会自动发起测试请求。</p></div>
    <div v-else class="api-workbench-grid">
      <aside class="api-case-directory" aria-label="API接口与用例列表">
        <div class="api-filters"><label><Search :size="14"/><input v-model="search" :disabled="busy" aria-label="搜索API用例" placeholder="搜索名称、路径或方法"/></label><select v-model="group" :disabled="busy" aria-label="筛选API分组"><option value="all">全部业务分组</option><option v-for="item in groups" :key="item" :value="item">{{item}}</option></select></div>
        <div ref="tableViewport" class="api-table-wrap">
          <table class="api-table"><thead><tr><th>{{store.apiGeneratedAt?'测试用例':'已导入接口'}}<span>{{visible.length}} / {{imported.length}}</span></th></tr></thead>
            <tbody><tr v-for="item in visible" :key="item.id" :data-case-id="item.id" :class="{running:runningId===item.id,selected:selected===item.id}"><td>
              <button class="api-case-select" :aria-label="`选择${item.name}`" :aria-pressed="selected===item.id" @click="selected=item.id">
                <span class="case-label"><span class="method" :class="item.method?.toLowerCase()">{{item.method}}</span><b>{{item.name}}</b></span>
                <span class="case-response"><span v-if="store.apiGeneratedAt" class="badge" :class="{good:store.apiResults[item.id]?.outcome==='passed',issue:store.apiResults[item.id]?.outcome==='failed',muted:!store.apiResults[item.id]}">{{runningId===item.id?'正在核验':resultName(item.id)}}</span><span v-else class="imported-label">已导入</span><code v-if="store.apiResults[item.id]?.status!=null">HTTP {{store.apiResults[item.id].status}}</code><code v-else-if="store.apiGeneratedAt">—</code></span>
                <code class="case-path">{{item.path}}</code>
              </button>
              <div v-if="store.apiGeneratedAt" class="case-row-footer"><small>{{store.apiResults[item.id]?`${store.apiResults[item.id].elapsedMs.toFixed(1)} ms`:`预期 HTTP ${item.status}`}}<template v-if="store.apiNotes[item.id]?.checkpoint"> · 补充检查：{{store.apiNotes[item.id].result==='passed'?'通过':store.apiNotes[item.id].result==='issue'?'需整改':'待人工确认'}}</template></small><div class="row-actions"><button class="text-button" :disabled="busy" :aria-label="`运行${item.name}`" @click="runOne(item.id)"><Play :size="13"/></button><button class="text-button" :disabled="busy" :aria-label="`编辑${item.name}`" @click="edit(item.id)"><PencilLine :size="13"/></button><button class="text-button" :disabled="busy || !store.apiResults[item.id]" :aria-label="`查看${item.name}结果`" @click="inspected=item.id"><Eye :size="14"/></button></div></div>
            </td></tr></tbody>
          </table>
          <div v-if="!visible.length" class="empty-state">没有匹配的接口用例。</div>
          <div v-if="running" class="api-scroll-tail" aria-hidden="true"/>
        </div>
      </aside>
      <div class="api-detail-viewport">
        <template v-if="store.apiGeneratedAt && selectedCase && material">
          <ApiMaterialPanel :material="material" :config="selectedCase"/>
          <section class="case-execution" aria-label="选中用例执行状态"><div class="execution-title"><h4>执行结果</h4><span v-if="runningId===selected" class="badge good"><LoaderCircle :size="13" class="spinning"/>正在核验</span><span v-else class="badge" :class="{good:selectedSample?.outcome==='passed',issue:selectedSample?.outcome==='failed',muted:!selectedSample}">{{resultName(selected)}}</span><b v-if="selectedSample?.status!=null" class="execution-http">HTTP {{selectedSample.status}}</b></div>
            <p v-if="!selectedSample">{{runningId===selected?'正在核验本地契约与响应，等待执行记录。':'尚未执行此用例。可运行全部用例，或使用左侧单项运行按钮。'}}</p>
            <template v-else><p class="evidence-source">证据来源：本地契约模型 · {{selectedSample.elapsedMs.toFixed(1)}} ms · 不发送真实业务请求</p><div v-if="selectedSample.checks.length" class="api-assertions"><div v-for="check in selectedSample.checks" :key="check.label"><CheckCircle2 :size="14"/><span>{{check.label}}</span><b>{{check.passed?'通过':'未通过'}}</b></div></div><p v-else>{{selectedSample.error || '本轮未产生响应证据'}}</p><button class="text-button" :disabled="busy" @click="inspected=selected">查看完整执行证据<ArrowRight :size="13"/></button></template>
          </section>
        </template>
        <div v-else class="empty-state api-generate-empty"><Code2 :size="36"/><h3>{{visible.length?'接口已导入，等待生成用例':'没有匹配的接口用例'}}</h3><p v-if="selectedEntry">已选择：{{selectedEntry.name}}</p><p>点击上方“生成测试用例”后，<br/>这里才会展示对应场景的请求参数、预期响应和验收点。</p></div>
      </div>
    </div>
  </section>
  <ModalFrame v-if="inspected && sample" title="API用例执行证据" wide @close="inspected=null"><div class="api-evidence"><div class="material-title"><h3>{{inspectedCase?.name}}</h3><span class="badge">{{sample.status==null?'未收到响应':`HTTP ${sample.status}`}} · {{sample.elapsedMs}} ms</span></div><code>{{sample.requestId}}</code><p class="evidence-source">证据来源：本地契约模型；未向校园业务服务发送测试请求。</p><div class="api-assertions"><div v-for="check in sample.checks" :key="check.label"><CheckCircle2 :size="15"/><span>{{check.label}}</span><b>{{check.passed?'通过':'未通过'}}</b></div></div><h4>本次用例请求参数（本地模型）</h4><pre>{{JSON.stringify(inspectedMaterial?.request,null,2)}}</pre><h4>固定响应与断言证据</h4><pre>{{sample.preview || '无响应内容'}}</pre><section v-if="store.apiNotes[inspected]?.checkpoint" class="manual-check"><h4>补充人工检查点</h4><p>{{store.apiNotes[inspected].checkpoint}}</p><button class="secondary" :disabled="busy || sample.outcome==='cancelled'" @click="emit('manual',inspected,'passed')">确认补充检查通过</button><button class="secondary" :disabled="busy || sample.outcome==='cancelled'" @click="emit('manual',inspected,'issue')">记录需整改</button><span class="badge">{{store.apiNotes[inspected].result==='passed'?'通过':store.apiNotes[inspected].result==='issue'?'需整改':'待确认'}}</span></section></div></ModalFrame>
  <ModalFrame v-if="editing" title="调整API测试用例" @close="editing=null"><form class="case-editor" @submit.prevent="saveEdit"><label>用例名称<input v-model="editing.config.name" aria-label="用例名称" maxlength="80"/></label><div class="editor-grid"><label>预期状态码<input type="number" v-model.number="editing.config.status" aria-label="预期状态码" min="100" max="599"/></label><label>耗时预算（ms）<input type="number" v-model.number="editing.config.budget" aria-label="耗时预算" min="1" max="60000"/></label></div><label>用例备注<textarea v-model="editing.note.note" aria-label="用例备注" maxlength="1000" rows="2"/></label><label>补充人工检查点<textarea v-model="editing.note.checkpoint" aria-label="补充人工检查点" maxlength="1000" rows="2"/></label><p>接口路径、方法及交付原始契约保持不变；保存调整会清除该用例的旧结果，补充检查点需人工确认。</p><p v-if="error" role="alert" class="inline-error">{{error}}</p><button class="primary" type="submit" :disabled="busy">保存用例调整</button></form></ModalFrame>
</template>
<style scoped>
.api-workbench { overflow:hidden; }
.api-report-entry { display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:12px 22px;background:#eef5e7;color:#658251;font-size:12px; }
.api-workbench-heading { padding:20px 22px; flex-wrap:wrap; }
.api-workbench-heading .toolbar-actions { gap:8px; }
.api-workbench-heading button { padding:10px 13px; font-size:12px; min-height:38px; }
.api-stage-track { display:flex; align-items:center; flex-wrap:wrap; gap:16px; padding:13px 22px; background:#f6f9f3; border-block:1px solid var(--line); color:#a1ad9a; font-size:11px; }
.api-stage-track > span { display:inline-flex; align-items:center; gap:7px; }
.api-stage-track i { display:grid; place-items:center; width:18px; height:18px; font:10px var(--mono); border:1px solid #dce5d7; border-radius:50%; }
.api-stage-track b { font-size:10px; font-weight:400; opacity:.8; }
.api-stage-track .done { color:#517f60; }
.api-stage-track .active { color:#25634f; }
.api-import-empty { min-height:390px; justify-content:center; }
.api-workbench-grid { display:grid; grid-template-columns:minmax(300px,38%) minmax(0,1fr); height:clamp(480px,calc(100dvh - 360px),660px); }
.api-case-directory { display:flex; flex-direction:column; min-height:0; min-width:0; border-right:1px solid var(--line); }
.api-filters { display:grid; grid-template-columns:minmax(0,1fr) 115px; gap:7px; padding:14px 12px; border-bottom:1px solid var(--line); }
.api-filters label { gap:6px; min-width:0; }
.api-filters input { padding:8px; font-size:11px; }
.api-filters select { padding:8px 4px; font-size:10px; border-color:#e0e7db; }
.api-table-wrap { flex:1; min-height:0; overflow:auto; position:relative; scroll-behavior:auto; overscroll-behavior:contain; scrollbar-gutter:stable; }
.api-table { width:100%; min-width:0; table-layout:fixed; }
.api-table th { position:sticky; top:0; z-index:2; width:100%; padding:11px 14px; background:#fafcf8; color:#819178; }
.api-table th span { float:right; font:10px var(--mono); }
.api-table td { padding:0; border-color:#edf1e9; }
.api-table tbody tr:hover { background:#edf4e7; }
.api-table tr.selected { background:#f0f5e9; }
.api-table tr.running { background:#e5efdc; box-shadow:inset 3px 0 #25634f; }
.api-case-select { display:grid; grid-template-columns:minmax(0,1fr) auto; width:100%; gap:7px 10px; padding:13px 13px 9px; text-align:left; justify-content:stretch; }
.case-label { display:flex; align-items:flex-start; gap:7px; min-width:0; }
.api-table .case-label b { font-size:12px; line-height:1.7; font-weight:500; color:#355b40; overflow-wrap:anywhere; }
.case-label .method { margin-top:2px; font-size:8px; }
.case-response { display:flex; flex-direction:column; align-items:flex-end; gap:3px; min-width:66px; }
.case-response .badge { padding:4px 7px; font-size:10px; }
.api-table .case-response code { margin:0; font-size:10px; color:#688461; white-space:nowrap; }
.imported-label { color:#8d9f83; font-size:10px; }
.api-table .case-path { grid-column:1/-1; margin:0; font-size:9px; color:#99a68e; line-height:1.6; }
.case-row-footer { display:flex; align-items:center; gap:6px; padding:0 13px 7px; min-height:26px; }
.api-table .case-row-footer small { flex:1; min-width:0; margin:0; font-size:9px; color:#8d9f84; }
.row-actions { flex-shrink:0; gap:5px; }
.row-actions button { padding:5px; border-radius:5px; }
.row-actions button:hover:not(:disabled) { background:#dfebd6; }
.api-scroll-tail { height:100%; }
.api-detail-viewport { min-width:0; min-height:0; overflow:auto; overscroll-behavior:contain; }
.api-generate-empty { height:100%; min-height:300px; justify-content:center; }
.run-progress { padding:14px 22px; border-bottom:1px solid var(--line); background:#f1f7eb; }
.run-progress > div:first-child { gap:14px; margin-bottom:9px; }
.run-progress > div:first-child span { display:flex; align-items:center; gap:7px; color:#355b40; font-size:12px; min-width:0; }
.run-progress b { color:#25634f; font:12px var(--mono); }
.progress-track { background:#dfead7; }
.progress-track i { background:linear-gradient(90deg,#82a77a,#25634f); position:relative; }
.progress-track i::after { content:''; position:absolute; inset:0; background:linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent); animation:api-flow 1.4s linear infinite; }
.run-progress p { margin-top:7px; color:#879e79; }
.case-execution { margin:0 22px 22px; border-top:1px solid var(--line); padding-top:18px; }
.execution-title { display:flex; align-items:center; gap:9px; }
.execution-title h4 { font-size:12px; font-weight:500; margin-right:auto; }
.execution-http { font:12px var(--mono); color:#517f60; }
.case-execution > p { color:#8c9c82; font-size:11px; line-height:1.8; margin-top:12px; }
.case-execution .api-assertions { margin-top:12px; padding:13px; gap:10px; }
.case-execution .api-assertions > div { align-items:flex-start; line-height:1.7; }
.case-execution .api-assertions b { white-space:nowrap; }
.case-execution .text-button { margin-top:8px; }
@keyframes api-flow { from { transform:translateX(-100%); } to { transform:translateX(100%); } }
@media(min-width:1600px) { .api-workbench-grid { grid-template-columns:minmax(380px,36%) minmax(0,1fr); } }
@media(max-width:900px) { .api-workbench-grid { grid-template-columns:minmax(260px,43%) minmax(0,1fr); }.api-filters { grid-template-columns:minmax(0,1fr); }.api-stage-track { gap:9px; }.api-stage-track b { display:none; } }
@media(max-width:700px) { .api-workbench-heading { padding:16px; }.api-workbench-heading .toolbar-actions { width:100%; }.api-workbench-heading button { flex:1; padding:9px; font-size:11px; }.api-stage-track { padding:12px 16px; font-size:10px; gap:8px; }.api-stage-track > span { gap:4px; }.api-workbench-grid { grid-template-columns:minmax(0,1fr); height:auto; }.api-case-directory { height:365px; border-right:0; border-bottom:1px solid var(--line); }.api-filters { grid-template-columns:minmax(0,1fr) 115px; }.api-detail-viewport { max-height:640px; }.api-import-empty { min-height:330px; }.case-execution { margin-inline:16px; } }
</style>
