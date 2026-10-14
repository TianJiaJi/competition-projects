<script setup lang="ts">
import { ArrowRight, FileText, Monitor, Code2, ShieldCheck, UserRound, ClipboardList, PackageOpen, Send, Gauge, ExternalLink, Link2, Info } from 'lucide-vue-next';
import { campusProject, apiMaterials, assignments, API_CASE_COUNT, projectUrl } from './campus-handoff';
import type { CampusTaskStore } from './task-store';
import { testWorkflow } from './test-workflow';
const props=defineProps<{store:CampusTaskStore;busy:boolean}>();
type Destination='ui'|'api'|'special'|'load'|'reports'|'center';
const emit=defineEmits<{navigate:[tab:Destination]}>();
const uiCount=campusProject.pages.reduce((sum,item)=>sum+item.checks.length,0);
const hostname=window.location.hostname;
const requirements=[
  {title:'师生业务链路要完整',detail:'核对学生提交教室预约、秒级请假，教师按班级审批，学生查看反馈或取消申请的完整链路。',source:'依据：预约 / 请假 / 教师审批接口及五端页面检查清单'},
  {title:'界面、参数与反馈要一致',detail:'关注五端布局与入口、表单及筛选操作、秒级时间、审批状态和拒绝原因；管理后台的预约管理保持只读。',source:'依据：前端页面检查项与接口请求、响应示例'},
  {title:'后端风险必须单独核验',detail:'重复提交、同一教室时段并发预约、跨账户与班级权限、弱网重试均需保留过程与断言证据。',source:'依据：后端工程师的四项固定专项指派'},
];
const scopes=[
  {tab:'ui' as const,icon:Monitor,title:'UI界面检查',range:`${campusProject.pages.length} 个页面入口 · ${uiCount} 项计划检查`,test:'逐端检查布局、入口、表单、筛选与审批反馈，确认不同视口下可读、可操作。',basis:'使用每端既定检查清单；需整改项必须填写问题说明，不能仅凭页面已打开判定通过。',output:'交回：五端检查结果、观察备注和UI报告。',action:'前往UI测试'},
  {tab:'api' as const,icon:Code2,title:'API契约测试',range:`${apiMaterials.length} 项交付接口 → ${API_CASE_COUNT} 项场景用例`,test:'先解析材料，再生成并执行正常、参数边界、权限及状态场景，核对HTTP响应码和字段契约。',basis:'以交付请求、响应示例及验收点为依据；补充检查需人工确认，不把取消记为通过。',output:'交回：逐项执行结果、响应及断言证据、未通过或未执行范围。',action:'前往API测试'},
  {tab:'special' as const,icon:ShieldCheck,title:'后端专项验证',range:`${assignments.length} 项风险指派 · 12 个模型断言`,test:'按固定要求生成场景，依次准备条件、触发请求和核验结果；支持一键顺序测试。',basis:'原始专项标准不可修改；核对单次写入、唯一时段占用、权限边界及重试回执。',output:'交回：场景参数、处理流水、状态前后变化和专项验收报告。',action:'前往专项测试'},
  {tab:'load' as const,icon:Gauge,title:'并发测试',range:'目标接口 · 并发 / 吞吐 / 响应延迟',test:'在生成API用例后选择接口，配置并发与时长，观察逐级加压过程中的吞吐和延迟。',basis:'记录完整测试过程；主动停止仅作为阶段记录。本地模型指标不能替代真实服务性能验收。',output:'交回：本轮配置、并发与延迟曲线、阶段数据和并发测试报告。',action:'前往并发测试'},
];
const orderedScopes=testWorkflow.map(step=>scopes.find(scope=>scope.tab===step.id)!);
const returns=[
  {title:'综合验收报告',format:'JSON / HTML',detail:'说明测试范围、执行结论和证据来源，关联本轮任务与项目版本。'},
  {title:'问题清单与未测范围',format:'随综合报告',detail:'保留问题描述、需整改项及未完成检查，不能用“任务已完成”代替“验收通过”。'},
  {title:'原始测试证据',format:'JSON，部分支持 HTML',detail:'UI检查、API结果、专项流水与断言、并发配置及曲线；专项和并发报告也支持HTML。'},
  {title:'反馈与归档回执',format:'本地任务记录',detail:'综合报告确认提交后关联反馈并完结任务；任务与归档报告保留，供重新查看与导出。'},
];
</script>
<template>
  <div class="section-intro"><div><span class="eyebrow">UPSTREAM HANDOFF / TEST BRIEF</span><h1>交付概览</h1><p>先看上游要求与交付内容，再明确测什么、按什么标准测、完成后交回什么。</p></div><span class="badge">本轮交接说明</span></div>
  <section class="panel solution-cover handoff-cover" aria-label="本轮交付关联"><div class="cover-label"><PackageOpen :size="20"/>上游项目交接</div><div class="handoff-project"><div><h2>{{campusProject.name}} <span>v{{campusProject.version}}</span></h2><p>{{campusProject.solution}} · {{campusProject.brand}}</p></div><span class="badge muted">{{store.completion?'已完结任务的交付材料':'交付材料，不代表测试已通过'}}</span></div><div class="handoff-identity"><span><UserRound :size="14"/>交付岗位：前端工程师 / 后端工程师</span><span>接收岗位：测试工程师</span><span>交付 <code>{{store.handoffId}}</code></span><span>任务 <code>{{store.taskId}}</code></span></div></section>
  <div class="handoff-overview-layout">
    <div class="handoff-main">
      <section class="panel brief-requirements" aria-label="上游验收要求"><header class="brief-heading"><span>01</span><div><h2>上游要求你验证什么</h2><p>按当前交付材料整理的验收要求</p></div></header><article v-for="item in requirements" :key="item.title"><ShieldCheck :size="16"/><div><h3>{{item.title}}</h3><p>{{item.detail}}</p><small>{{item.source}}</small></div></article></section>
      <section class="panel delivered-materials" aria-label="本次交付清单"><header class="brief-heading"><span>02</span><div><h2>本次交付了什么</h2><p>页面入口、接口契约与专项指派，不是已完成的测试结果</p></div></header>
        <div class="delivery-material-block"><div class="material-block-heading"><Monitor :size="17"/><h3>五端项目入口</h3><span>{{campusProject.pages.length}} 个</span></div><div class="delivered-pages"><article v-for="entry in campusProject.pages" :key="entry.id"><div><b>{{entry.name}}</b><small>{{entry.checks.length}} 项既定检查 · {{entry.device==='phone'?'手机页面':'桌面页面'}}</small><code>{{projectUrl(entry,hostname)}}</code></div><a :href="projectUrl(entry,hostname)" target="_blank" rel="noopener noreferrer" :aria-label="`打开${entry.name}交付页面`"><ExternalLink :size="15"/></a></article></div><p class="material-footnote">打开入口仅用于查看交付页面；检查结果仍需在UI测试中保存。</p></div>
        <div class="delivery-material-block"><div class="material-block-heading"><Code2 :size="17"/><h3>API交付材料</h3><span>{{apiMaterials.length}} 项</span></div><p>包含方法、路径、岗位身份、请求参数、响应示例和验收点。{{API_CASE_COUNT}} 项是后续生成的测试场景，不是额外交付的接口。</p><details class="api-delivery-list"><summary>展开 {{apiMaterials.length}} 项接口交付清单</summary><div class="delivery-api-table"><table><thead><tr><th>方法</th><th>交付接口</th><th>验收依据</th></tr></thead><tbody><tr v-for="item in apiMaterials" :key="item.id"><td><span class="method" :class="item.method.toLowerCase()">{{item.method}}</span></td><td><b>{{item.name}}</b><code>{{item.path}}</code><small>{{item.role}}</small></td><td>{{item.checkpoint}}</td></tr></tbody></table></div></details><p class="material-footnote">本页只是交付清单。前往API测试后，仍需主动解析导入、生成用例，不会因查看本页自动执行。</p></div>
        <div class="delivery-material-block"><div class="material-block-heading"><ShieldCheck :size="17"/><h3>后端工程师指定任务</h3><span>{{assignments.length}} 项</span></div><div class="delivered-assignments"><article v-for="item in assignments" :key="item.id"><h4>{{item.title}}</h4><p>{{item.risk}}</p><div><span>验收标准</span>{{item.standard}}</div></article></div></div>
        <div class="delivery-service"><Link2 :size="15"/><div><b>关联预约 / 请假服务</b><code>http://{{hostname}}:5606</code><p>服务可用性以右上角环境核验结果为准，交付清单不等同于服务已验收。</p></div></div>
      </section>
      <section class="testing-brief" aria-label="本轮测试任务"><header class="brief-heading"><span>03</span><div><h2>需要执行哪些测试</h2><p>以下为计划范围，不是已执行数量或通过统计</p></div></header><div class="delivery-chain test-scope-grid"><article v-for="item in orderedScopes" :key="item.tab" class="panel"><div class="scope-card-title"><component :is="item.icon" :size="19"/><h3>{{item.title}}</h3></div><span class="scope-range">{{item.range}}</span><p>{{item.test}}</p><div class="scope-acceptance"><b>验收依据</b>{{item.basis}}</div><small>{{item.output}}</small><button class="text-button" :disabled="busy || !!store.completion" @click="emit('navigate',item.tab)">{{item.action}}<ArrowRight :size="14"/></button></article></div></section>
    </div>
    <aside class="handoff-return-column">
      <section class="panel return-package" aria-label="测试回交要求"><header class="brief-heading"><span>04</span><div><h2>完成后需要交回什么</h2><p>接收方：前端工程师 / 后端工程师</p></div></header><article v-for="(item,index) in returns" :key="item.title"><span>{{index+1}}</span><div><h3>{{item.title}}</h3><small>{{item.format}}</small><p>{{item.detail}}</p></div></article><div class="return-action"><button class="primary" :disabled="busy" @click="emit('navigate',store.completion?'center':'reports')"><Send :size="15"/>{{store.completion?'返回任务中心查看归档':'前往验收报告'}}<ArrowRight :size="14"/></button><p>{{store.completion?'原始测试记录不会恢复进工作区。':'本入口只打开报告页，不自动汇总、提交或完结任务。'}}</p></div></section>
      <section class="panel handoff-rules" aria-label="回交前核对"><h3><ClipboardList :size="17"/>回交前核对</h3><ul><li>覆盖本轮计划测试与人工补充检查。</li><li>汇总当前已保存的最新记录，完整保留整改问题与未测范围。</li><li>全部计划完成后确认提交；部分记录可先提交阶段反馈。</li><li>测试任务完结与项目验收通过是两个不同结论。</li></ul></section>
      <div class="handoff-source"><Info :size="16"/><p>本页依据当前项目的固定交付清单整理。API、专项及并发测试使用本地模型；反馈与归档是工作台本地记录，不代表远程团队实际收到。</p></div>
    </aside>
  </div>
</template>
<style scoped>
.handoff-cover { padding:24px; margin-bottom:22px; background:linear-gradient(115deg,#fff,#f5f8ef); }
.cover-label { color:#7d9471; font-size:11px; }
.handoff-project { display:flex; align-items:center; justify-content:space-between; gap:15px; flex-wrap:wrap; }
.handoff-project h2 { font-size:23px; color:#294b35; margin:0 0 8px; }.handoff-project h2 span { font:12px var(--mono); color:#98a38e; margin-left:8px; }
.handoff-project p { font-size:12px; color:#829476; }
.handoff-identity { display:flex; align-items:center; flex-wrap:wrap; gap:12px 22px; padding-top:18px; margin-top:19px; border-top:1px solid #e4ebdc; font-size:10px; color:#91a083; }.handoff-identity > span { display:flex; align-items:center; gap:6px; }.handoff-identity code { font-size:9px; }
.handoff-overview-layout { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:20px; align-items:start; }
.handoff-main { min-width:0; display:flex; flex-direction:column; gap:22px; }
.brief-heading { display:flex; align-items:center; gap:12px; padding:22px 24px; }
.brief-heading > span { display:grid; place-items:center; width:31px; height:31px; flex-shrink:0; border-radius:8px; background:#edf4e6; color:#789664; font:12px var(--mono); }
.brief-heading h2 { font-size:16px; font-weight:600; color:#355b40; }.brief-heading p { font-size:10px; color:#99a68d; margin-top:7px; line-height:1.7; }
.brief-requirements { padding-bottom:7px; }.brief-requirements > article { display:flex; gap:10px; margin:0 24px; padding:16px 0; border-top:1px solid #edf1e8; color:#89a07a; }.brief-requirements > article svg { margin-top:2px; }.brief-requirements h3 { font-size:13px; font-weight:500; color:#53754c; }.brief-requirements article p { color:#84977a; font-size:11px; line-height:1.9; margin-top:9px; }.brief-requirements small { display:block; font-size:9px; color:#a5b09b; line-height:1.8; margin-top:8px; }
.delivery-material-block { border-top:1px solid #edf1e7; margin:0 24px; padding:19px 0; }
.material-block-heading { display:flex; align-items:center; gap:8px; color:#7e966e; margin-bottom:13px; }.material-block-heading h3 { font-size:13px; font-weight:500; color:#55784c; }.material-block-heading > span { margin-left:auto; font-size:10px; color:#9ba98e; }
.delivered-pages { display:grid; grid-template-columns:minmax(0,1fr); }
.delivered-pages article { display:flex; align-items:center; gap:10px; padding:12px; margin-bottom:7px; border:1px solid #e8eddf; background:#fafcf7; border-radius:7px; }.delivered-pages article > div { flex:1; min-width:0; }.delivered-pages b { font-size:11px; font-weight:500; color:#608052; }.delivered-pages small { font-size:9px; color:#a0ac94; margin-left:12px; }.delivered-pages code { display:block; font-size:9px; color:#93a384; line-height:1.8; margin-top:6px; }.delivered-pages a { display:grid; place-items:center; width:28px; height:28px; border-radius:6px; color:#769665; flex-shrink:0; }.delivered-pages a:hover { background:#e9f1e0; }
.delivery-material-block > p { font-size:11px; line-height:1.9; color:#8b9c80; }.delivery-material-block .material-footnote { color:#a0ae93; font-size:10px; margin-top:10px; }
.api-delivery-list { margin-top:13px; }.api-delivery-list summary { cursor:pointer; font-size:11px; color:#759261; padding:9px 0; }
.delivery-api-table { overflow:auto; margin-top:8px; }.delivery-api-table table { width:100%; border-collapse:collapse; font-size:10px; table-layout:fixed; }.delivery-api-table th,.delivery-api-table td { text-align:left; border-bottom:1px solid #e9eee3; padding:10px 8px; color:#819773; overflow-wrap:anywhere; line-height:1.8; }.delivery-api-table th { font-weight:500; background:#f6f9f1; }.delivery-api-table th:first-child { width:62px; }.delivery-api-table th:nth-child(2) { width:49%; }.delivery-api-table b { font-weight:500; color:#638553; }.delivery-api-table code,.delivery-api-table small { display:block; font-size:9px; color:#a2ae97; }
.delivered-assignments { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }.delivered-assignments article { padding:14px; background:#f8faf4; border:1px solid #e8edde; border-radius:8px; }.delivered-assignments h4 { font-size:12px; font-weight:500; color:#668556; }.delivered-assignments p { font-size:10px; color:#99a58f; line-height:1.8; margin:8px 0 12px; }.delivered-assignments article > div { font-size:10px; color:#839974; line-height:1.9; border-top:1px solid #e6ecde; padding-top:10px; }.delivered-assignments article > div span { display:block; color:#a8b19f; font-size:9px; margin-bottom:5px; }
.delivery-service { display:flex; align-items:flex-start; gap:9px; padding:17px 24px; border-top:1px solid #e7eddf; background:#fafcf7; border-radius:0 0 13px 13px; color:#819970; }.delivery-service b { font-size:11px; font-weight:500; }.delivery-service code { display:block; font-size:10px; margin:7px 0; color:#97a68a; }.delivery-service p { font-size:10px; line-height:1.9; color:#a2ae96; }
.testing-brief > .brief-heading { padding:0 0 16px; }
.test-scope-grid { margin:0; gap:14px; }.test-scope-grid article { display:flex; flex-direction:column; padding:20px; }.scope-card-title { display:flex; align-items:center; gap:8px; color:#7c9870; }.test-scope-grid .scope-card-title h3 { font-size:14px; color:#4f7348; margin:0; }.scope-range { font-size:10px; color:#95a685; margin-top:12px; }.test-scope-grid article > p { font-size:11px; color:#8d9e81; line-height:1.9; margin:14px 0; }.scope-acceptance { border-top:1px solid #e9eee2; padding-top:12px; font-size:10px; color:#8c9e7d; line-height:1.9; }.scope-acceptance b { display:block; font-size:9px; font-weight:400; color:#a6b09c; margin-bottom:6px; }.test-scope-grid article > small { display:block; font-size:10px; color:#839b72; line-height:1.8; padding:12px 0; }.test-scope-grid .text-button { align-self:flex-start; margin-top:auto; font-size:11px; }
.handoff-return-column { min-width:0; display:grid; gap:18px; }.return-package .brief-heading { padding:21px 19px; gap:9px; }.return-package .brief-heading h2 { font-size:15px; }
.return-package > article { display:flex; align-items:flex-start; gap:10px; padding:17px 0; margin:0 19px; border-top:1px solid #e9eee2; }.return-package > article > span { display:grid; place-items:center; flex-shrink:0; width:21px; height:21px; border:1px solid #dfe8d4; color:#96aa81; border-radius:50%; font:10px var(--mono); }.return-package h3 { font-size:12px; font-weight:500; color:#5c804e; }.return-package article small { display:block; font-size:9px; color:#a6b29b; margin-top:7px; }.return-package article p { font-size:11px; line-height:1.9; color:#8a9e7b; margin-top:9px; }
.return-action { padding:17px 19px; background:#f7faf2; border-top:1px solid #e9efdf; border-radius:0 0 13px 13px; }.return-action .primary { width:100%; padding:11px; font-size:12px; }.return-action p { font-size:9px; color:#a0b08f; line-height:1.9; margin-top:10px; }
.handoff-rules { padding:20px; }.handoff-rules h3 { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; color:#6d8d5d; }.handoff-rules ul { margin:15px 0 0; padding-left:17px; display:grid; gap:10px; color:#94a487; font-size:10px; line-height:1.9; }
.handoff-source { display:flex; align-items:flex-start; gap:8px; padding:0 3px; color:#a2b093; }.handoff-source p { font-size:9px; line-height:1.9; }
@media(min-width:1600px) { .handoff-overview-layout { grid-template-columns:minmax(0,1fr) 340px; }.delivered-pages { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }.delivered-pages article { margin:0; }.delivered-pages small { display:block; margin:6px 0 0; } }
@media(max-width:1100px) { .handoff-overview-layout { grid-template-columns:minmax(0,1fr); }.handoff-return-column { grid-template-columns:1fr 1fr; align-items:start; }.handoff-source { grid-column:1/-1; } }
@media(max-width:700px) { .handoff-cover { padding:19px; }.handoff-identity { gap:10px; }.handoff-overview-layout { gap:22px; }.brief-heading { padding:19px 16px; }.brief-requirements > article,.delivery-material-block { margin-inline:16px; }.brief-heading h2 { font-size:15px; }.delivered-pages small { display:block; margin:6px 0 0; }.delivered-assignments,.test-scope-grid,.handoff-return-column { grid-template-columns:minmax(0,1fr); }.handoff-return-column { gap:15px; }.delivery-service { padding-inline:16px; }.delivery-api-table th:first-child { width:50px; }.delivery-api-table th:nth-child(2) { width:46%; }.delivery-api-table td,.delivery-api-table th { padding-inline:5px; } }
</style>
