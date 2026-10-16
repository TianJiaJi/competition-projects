<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArrowRight, Send, Bell, Layers3, FileCheck2, History, CheckCircle2 } from 'lucide-vue-next';
import { campusProject, apiMaterials, assignments } from './campus-handoff';
import type { CampusTaskStore } from './task-store';
import { taskProgress } from './task-lifecycle';
import { historicalTasks, type HistoricalTask } from './task-history';
import TaskTimeline from './TaskTimeline.vue';
import ModalFrame from './ModalFrame.vue';
const props = defineProps<{ store: CampusTaskStore; busy: boolean; running?: boolean }>();
const emit = defineEmits<{ receive: []; enter: []; report: [] }>();
const filter = ref<'all'|'active'|'completed'>('all'), selectedHistory = ref<HistoricalTask|null>(null);
const progress = computed(() => taskProgress(props.store, props.running));
const activeCount = computed(() => props.store.receivedAt && !props.store.completion ? 1 : 0);
const completedCount = computed(() => historicalTasks.length + (props.store.completion ? 1 : 0));
const showCurrent = computed(() => !!props.store.receivedAt && (filter.value === 'all' || (filter.value === 'completed') === !!props.store.completion));
const showHistory = computed(() => filter.value !== 'active');
const formatDate = (value:string) => new Date(value).toLocaleDateString('zh-CN');
watch(() => props.store.receivedAt, () => { filter.value='all'; });
</script>
<template>
  <section class="section-intro task-center-heading">
    <div><span class="eyebrow">DELIVERY TASKS / QUALITY WORKBENCH</span><h1>我的测试任务</h1><p>接收交付、记录测试、汇总报告，再提交归档，完成一轮质量闭环。</p></div>
    <div class="toolbar-actions"><span v-if="store.receivedAt" class="badge">本版本已接收，不重复建单</span><button class="primary" :disabled="busy || !!store.receivedAt" @click="emit('receive')"><Send :size="16"/>{{busy && !store.receivedAt?'正在接收交付…':'接收上游交付'}}</button></div>
  </section>
  <div class="task-metrics">
    <article><span>当前测试项目</span><strong>{{store.completion?'暂无进行中任务':store.receivedAt?campusProject.name:'等待接收'}}</strong><small>{{store.completion?`${campusProject.name} · 验收报告已归档`:store.receivedAt?`${campusProject.brand} · v${campusProject.version}`:'接收后识别项目与版本'}}</small></article>
    <article><span>待办测试任务</span><strong>{{activeCount}}<em>项</em></strong><small>{{store.completion?'本轮任务已提交归档':store.receivedAt?progress?.label:'等待接收上游交付'}} · 历史示例不计入</small></article>
    <article><span>交付API材料</span><strong>{{store.receivedAt?apiMaterials.length:'—'}}<em v-if="store.receivedAt">项</em></strong><small>方法 · 参数 · 响应 · 验收点</small></article>
    <article><span>后端专项指派</span><strong>{{store.receivedAt?assignments.length:'—'}}<em v-if="store.receivedAt">项</em></strong><small>业务风险与验收标准</small></article>
  </div>
  <div class="center-columns"><div>
    <section class="panel task-list">
      <div class="panel-heading"><div><h2>任务列表</h2><p class="list-caption">本轮任务与历史归档一览，测试状态和验收结论分别展示。</p></div><span>{{historicalTasks.length+(store.receivedAt?1:0)}} 项任务</span></div>
      <div class="task-filters" role="group" aria-label="筛选测试任务"><button :class="{selected:filter==='all'}" :aria-pressed="filter==='all'" @click="filter='all'">全部 {{historicalTasks.length+(store.receivedAt?1:0)}}</button><button :class="{selected:filter==='active'}" :aria-pressed="filter==='active'" @click="filter='active'">进行中 {{activeCount}}</button><button :class="{selected:filter==='completed'}" :aria-pressed="filter==='completed'" @click="filter='completed'">已完成 {{completedCount}}</button><small><History :size="12"/>历史示例仅供展示</small></div>
      <article v-if="showCurrent && progress" class="task-row delivery-task-card">
        <div class="task-row-main"><span class="task-icon current"><Layers3 :size="22"/></span><div class="task-row-title"><span class="eyebrow">{{store.taskId}} · 本轮交付</span><h3>智慧校园 · 五端项目验收</h3><p>{{campusProject.frontend}} / {{campusProject.backend}} · v{{campusProject.version}}</p></div></div>
        <div class="task-row-state"><span class="badge task-status" :class="{good:!!store.completion}" :data-phase="progress.phase">{{progress.label}}</span><small v-if="store.completion">{{store.completion.verdict==='review'?'结论：待整改':'结论：本轮检查通过'}}</small><small v-else>已检查 {{progress.done}} / {{progress.total}}</small></div>
        <div class="task-row-date"><small>{{store.completion?'完结时间':'接收时间'}}</small><time>{{formatDate(store.completion?.at || store.receivedAt!)}}</time></div>
        <button v-if="store.completion" class="secondary" :disabled="busy" @click="emit('report')">查看验收报告<ArrowRight :size="14"/></button><button v-else class="primary" :disabled="busy" @click="emit('enter')">进入测试空间<ArrowRight :size="14"/></button>
        <div class="task-row-progress"><progress :value="progress.percent" max="100" aria-label="本轮测试完成进度"/><span>{{progress.detail}}</span><button v-if="!store.completion && ['summarize','submit'].includes(progress.phase)" class="text-button" :disabled="busy" @click="emit('report')">前往验收报告<ArrowRight :size="13"/></button></div>
      </article>
      <article v-for="item in showHistory?historicalTasks:[]" :key="item.id" class="task-row historical-task-row">
        <div class="task-row-main"><span class="task-icon"><FileCheck2 :size="21"/></span><div class="task-row-title"><span class="eyebrow">{{item.id}} · 历史示例</span><h3>{{item.name}}</h3><p>{{item.owner}} · v{{item.version}} · {{item.checks}} 项检查</p></div></div>
        <div class="task-row-state"><span class="badge good">已完成</span><small :class="{remaining:item.issues}">{{item.issues?`结论：${item.issues} 项待整改`:'结论：本轮检查通过'}}</small></div>
        <div class="task-row-date"><small>完结时间</small><time>{{formatDate(item.completedAt)}}</time></div>
        <button class="secondary" :aria-label="`查看${item.id}历史摘要`" @click="selectedHistory=item">查看摘要<ArrowRight :size="14"/></button>
      </article>
      <div v-if="!showCurrent && !showHistory" class="empty-state"><CheckCircle2 :size="30"/><h3>暂无进行中的任务</h3><p>{{store.completion?'本轮任务已归档，可在“已完成”中查看。':'点击上方“接收上游交付”，创建本轮测试任务。'}}</p></div>
      <p class="history-footnote">历史示例与本轮测试记录隔离，不计入本轮待办、检查进度或验收报告。</p>
    </section>
    <section class="panel handoff-guide"><h3>从接收到完结，每一步都有依据。</h3><div class="guide-track"><span>接收交付</span><ArrowRight :size="14"/><span>执行测试</span><ArrowRight :size="14"/><span>汇总报告</span><ArrowRight :size="14"/><span>确认提交</span><ArrowRight :size="14"/><span>任务归档</span></div><p>阶段反馈不会完结任务；全部计划检查完成后才可正式提交。任务已完成，不等于项目无需整改。</p></section>
  </div><aside>
    <section class="panel inbox-panel"><div class="panel-heading"><h3><Bell :size="17"/>交付消息</h3><span class="badge">{{activeCount}}</span></div><template v-if="activeCount"><div class="message-author"><span class="avatar">后</span><div><b>后端工程师</b><small>项目交付通知</small></div></div><h4>智慧校园项目已交付，请安排验收。</h4><p>五端页面、API材料及后端专项要求已关联至本轮任务。</p><div class="message-attachments"><span>五端入口 × 5</span><span>API材料 × {{apiMaterials.length}}</span><span>专项要求 × 4</span></div><button class="text-button" :disabled="busy" @click="emit('enter')">查看交付材料<ArrowRight :size="15"/></button><small class="message-id">{{store.messageId}} → {{store.taskId}}</small></template><template v-else><p v-if="store.completion">本轮任务已完结，暂无待处理交付消息。交付材料与验收报告已归档，可在已完成任务中查看。</p><p v-else>尚未接收本轮交付。点击页面上方“接收上游交付”，将新增一个既定测试任务及关联材料。</p></template></section>
    <TaskTimeline :entries="store.timeline"/>
  </aside></div>
  <ModalFrame v-if="selectedHistory" title="历史任务摘要" @close="selectedHistory=null"><div class="environment-body historical-summary"><span class="badge">历史示例 · 只读</span><h3>{{selectedHistory.name}}</h3><p>{{selectedHistory.id}} · v{{selectedHistory.version}}<br/>{{selectedHistory.owner}}</p><dl><div><dt>任务状态</dt><dd>已完成</dd></div><div><dt>检查范围</dt><dd>{{selectedHistory.checks}} 项检查已结束</dd></div><div><dt>验收结论</dt><dd>{{selectedHistory.issues?`${selectedHistory.issues} 项待整改`:'本轮检查通过'}}</dd></div><div><dt>归档编号</dt><dd>{{selectedHistory.reportId}}</dd></div><div><dt>接收 / 完结</dt><dd>{{formatDate(selectedHistory.receivedAt)}} / {{formatDate(selectedHistory.completedAt)}}</dd></div></dl><p>{{selectedHistory.summary}}</p><small>这些是用于展示任务列表的历史示例，不代表本轮实际执行，不支持重新运行，也不会写入当前任务证据。</small></div><div class="dialog-footer"><button class="primary" @click="selectedHistory=null">关闭</button></div></ModalFrame>
</template>
<style scoped>
.task-center-heading { margin-bottom:18px; }
.task-center-heading h1 { font-size:25px; }
.task-metrics { margin-top:0; }
.list-caption { margin-top:7px; color:var(--muted); font-size:11px; line-height:1.7; }
.task-list .panel-heading { padding:20px 22px 14px; }
.task-filters { display:flex; align-items:center; flex-wrap:wrap; gap:6px; padding:0 20px 14px; border-bottom:1px solid var(--line); }
.task-filters > button { padding:7px 11px; border-radius:6px; font-size:12px; color:#7a8b71; }
.task-filters > button.selected { color:#25634f; background:#edf4e5; font-weight:600; }
.task-filters small { display:flex; align-items:center; gap:4px; margin-left:auto; color:#91a086; font-size:10px; }
.task-row { display:grid; grid-template-columns:minmax(0,1fr) 114px 100px 144px; gap:12px; align-items:center; padding:18px 20px; border-bottom:1px solid var(--line); }
.task-row.delivery-task-card { padding:18px 20px; background:#fafcf7; }
.task-row-main { display:flex; align-items:center; gap:11px; min-width:0; }
.task-icon { width:39px; height:42px; display:grid; place-items:center; border-radius:9px; background:#f1f5ed; color:#8a9d7c; flex-shrink:0; }
.task-icon.current { color:#25634f; background:#e8f0df; }
.task-row-title { min-width:0; }
.task-row-title .eyebrow { font-size:9px; letter-spacing:.4px; }
.task-row-title h3 { font-size:14px; font-weight:600; line-height:1.6; margin:4px 0; overflow-wrap:anywhere; }
.task-row-title p { font-size:10px; color:#8a9980; line-height:1.8; }
.task-row-state { display:flex; flex-direction:column; align-items:flex-start; gap:7px; }
.task-row-state small,.task-row-date small { font-size:10px; color:#8a9980; line-height:1.6; }
.task-row-state .remaining { color:#a07a38; }
.task-row-date { display:grid; gap:6px; }
.task-row-date time { font:11px var(--mono); color:#647c59; }
.task-row > button { font-size:11px; padding:9px 10px; }
.task-row-progress { grid-column:1/-1; display:flex; align-items:center; flex-wrap:wrap; gap:10px; padding-left:50px; color:#819477; font-size:10px; line-height:1.8; }
.task-row-progress progress { width:100px; height:5px; accent-color:#4c855b; }
.task-row-progress .text-button { margin-left:auto; padding:0; font-size:11px; }
.history-footnote { padding:12px 20px 15px; color:#97a28d; font-size:10px; line-height:1.7; }
.historical-summary h3 { margin:16px 0 10px; font-size:18px; }
.historical-summary dl { margin:16px 0; font-size:12px; }
.historical-summary dl > div { display:flex; gap:16px; border-bottom:1px solid var(--line); padding:10px 0; }
.historical-summary dt { color:#899a7d; flex:0 0 85px; }
.historical-summary dd { margin:0; overflow-wrap:anywhere; }
@media(max-width:1350px) { .task-row { grid-template-columns:minmax(0,1fr) 110px 130px; }.task-row-date { display:none; } }
@media(max-width:700px) { .task-metrics { grid-template-columns:repeat(2,minmax(0,1fr)); }.task-metrics article { padding:15px; }.task-metrics strong { font-size:22px; }.center-columns > aside { display:flex; flex-direction:column; }.task-row { grid-template-columns:minmax(0,1fr) auto; padding:15px; }.task-row.delivery-task-card { padding:15px; }.task-row-state { grid-column:2; grid-row:1; }.task-row > button { grid-column:1/-1; justify-self:end; }.task-row-progress { padding-left:0; }.task-filters small { width:100%; margin-left:8px; }.task-center-heading .toolbar-actions { width:100%; }.task-row-main { gap:8px; }.task-icon { display:none; } }
</style>
